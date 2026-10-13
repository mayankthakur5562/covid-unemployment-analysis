from pathlib import Path
import io
import base64
import threading

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
sns.set_theme(style="whitegrid")

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
OUTPUT_DIR = ROOT / "outputs"
DATA_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
DATA_LOCK = threading.Lock()
DATA = None
SOURCE_NAME = None


def normalize_columns(df):
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    rename = {}
    for col in df.columns:
        key = col.strip().lower().replace("_", " ")
        key = " ".join(key.split())
        if key == "region":
            rename[col] = "Region"
        elif key == "date":
            rename[col] = "Date"
        elif "estimated unemployment rate" in key or key in ("unemployment rate", "unemployment rate (%)"):
            rename[col] = "Unemployment_Rate"
        elif "estimated employed" in key or key == "employed":
            rename[col] = "Employed"
        elif "estimated labour participation rate" in key or "estimated labor participation rate" in key or "labour participation rate" in key or "labor participation rate" in key:
            rename[col] = "Labour_Participation_Rate"
        elif key == "area":
            rename[col] = "Area"
        elif key == "frequency":
            rename[col] = "Frequency"
    return df.rename(columns=rename)


def clean_data(raw):
    df = normalize_columns(raw)
    required = ["Region", "Date", "Unemployment_Rate"]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(
            "CSV is missing required columns: " + ", ".join(missing) +
            ". Required: Region, Date, Estimated Unemployment Rate (%)."
        )

    df["Region"] = df["Region"].astype("string").str.strip()
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce", dayfirst=True)
    for col in ["Unemployment_Rate", "Employed", "Labour_Participation_Rate"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    original_rows = len(df)
    df = df.dropna(subset=["Region", "Date", "Unemployment_Rate"])
    df = df.drop_duplicates()
    df = df[df["Unemployment_Rate"].between(0, 100)]
    df = df[df["Region"].str.len() > 0]
    if df.empty:
        raise ValueError("No valid records remain after cleaning. Check the CSV date and rate columns.")

    df["Year"] = df["Date"].dt.year
    df["Month"] = df["Date"].dt.month
    df["Month_Name"] = df["Date"].dt.strftime("%b")
    df["Period"] = np.where(
        df["Date"] < pd.Timestamp("2020-03-01"),
        "Before COVID-19",
        "COVID-19 period onward"
    )
    df = df.sort_values("Date")
    df.attrs["input_rows"] = original_rows
    return df


def load_default_dataset():
    global DATA, SOURCE_NAME
    candidates = [
        DATA_DIR / "Unemployment_Rate_upto_11_2020.csv",
        DATA_DIR / "Unemployment in India.csv",
        DATA_DIR / "unemployment.csv",
    ]
    for path in candidates:
        if path.exists():
            raw = pd.read_csv(path)
            DATA = clean_data(raw)
            SOURCE_NAME = path.name
            return


def get_data():
    if DATA is None:
        raise ValueError(
            "No dataset is loaded. Upload your unemployment CSV in the dashboard "
            "or place it in server/data/ and restart the server."
        )
    return DATA.copy()


def json_records(frame):
    result = frame.copy()
    if "Date" in result.columns:
        result["Date"] = result["Date"].dt.strftime("%Y-%m-%d")
    result = result.replace({np.nan: None})
    return result.to_dict(orient="records")


def chart_base64(fig):
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    buffer.seek(0)
    return "data:image/png;base64," + base64.b64encode(buffer.read()).decode("ascii")


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "dataset_loaded": DATA is not None, "source": SOURCE_NAME})


@app.post("/api/upload")
def upload():
    global DATA, SOURCE_NAME
    file = request.files.get("file")
    if not file or not file.filename.lower().endswith(".csv"):
        return jsonify({"error": "Please choose a CSV file."}), 400
    try:
        raw = pd.read_csv(file)
        cleaned = clean_data(raw)
        with DATA_LOCK:
            DATA = cleaned
            SOURCE_NAME = file.filename
        return jsonify({
            "message": "Dataset uploaded and cleaned successfully.",
            "source": SOURCE_NAME,
            "rows": int(len(DATA)),
            "regions": int(DATA["Region"].nunique()),
            "date_min": DATA["Date"].min().strftime("%Y-%m-%d"),
            "date_max": DATA["Date"].max().strftime("%Y-%m-%d"),
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.get("/api/summary")
def summary():
    try:
        df = get_data()
        monthly = df.groupby(pd.Grouper(key="Date", freq="MS"))["Unemployment_Rate"].mean().dropna()
        period = df.groupby("Period")["Unemployment_Rate"].mean()
        region = df.groupby("Region")["Unemployment_Rate"].mean().sort_values(ascending=False)
        month = df.groupby("Month")["Unemployment_Rate"].mean().reindex(range(1, 13)).dropna()
        return jsonify({
            "source": SOURCE_NAME,
            "rows": int(len(df)),
            "regions_count": int(df["Region"].nunique()),
            "date_min": df["Date"].min().strftime("%Y-%m-%d"),
            "date_max": df["Date"].max().strftime("%Y-%m-%d"),
            "mean_rate": round(float(df["Unemployment_Rate"].mean()), 2),
            "median_rate": round(float(df["Unemployment_Rate"].median()), 2),
            "max_rate": round(float(df["Unemployment_Rate"].max()), 2),
            "min_rate": round(float(df["Unemployment_Rate"].min()), 2),
            "highest_region": {"name": str(region.index[0]), "rate": round(float(region.iloc[0]), 2)},
            "lowest_region": {"name": str(region.index[-1]), "rate": round(float(region.iloc[-1]), 2)},
            "monthly_trend": [{"date": d.strftime("%Y-%m-%d"), "rate": round(float(v), 2)} for d, v in monthly.items()],
            "period_comparison": [{"period": str(k), "rate": round(float(v), 2)} for k, v in period.items()],
            "seasonality": [{"month": int(k), "name": pd.Timestamp(2000, int(k), 1).strftime("%b"), "rate": round(float(v), 2)} for k, v in month.items()],
            "regions": [{"region": str(k), "rate": round(float(v), 2)} for k, v in region.items()],
            "cleaning": {
                "input_rows": int(df.attrs.get("input_rows", len(df))),
                "valid_rows": int(len(df))
            }
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.get("/api/records")
def records():
    try:
        df = get_data()
        limit = min(max(int(request.args.get("limit", 100)), 1), 1000)
        return jsonify({"records": json_records(df.head(limit)), "total": int(len(df))})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.get("/api/chart/<chart_name>")
def chart(chart_name):
    try:
        df = get_data()
        fig, ax = plt.subplots(figsize=(10, 5.5))
        if chart_name == "trend":
            data = df.groupby(pd.Grouper(key="Date", freq="MS"))["Unemployment_Rate"].mean().dropna()
            ax.plot(data.index, data.values, marker="o", linewidth=2)
            ax.axvline(pd.Timestamp("2020-03-01"), linestyle="--", label="COVID-19 period starts")
            ax.legend()
            ax.set_title("Average Unemployment Rate Over Time")
            ax.set_xlabel("Date")
        elif chart_name == "covid":
            order = ["Before COVID-19", "COVID-19 period onward"]
            data = df.groupby("Period")["Unemployment_Rate"].mean().reindex(order).dropna()
            sns.barplot(x=data.index, y=data.values, ax=ax)
            ax.set_title("Before vs COVID-19 Period")
            ax.set_xlabel("")
            ax.tick_params(axis="x", rotation=8)
        elif chart_name == "monthly":
            data = df.groupby("Month")["Unemployment_Rate"].mean().reindex(range(1, 13))
            sns.barplot(x=[pd.Timestamp(2000, i, 1).strftime("%b") for i in range(1, 13)],
                        y=data.values, ax=ax)
            ax.set_title("Average Rate by Calendar Month")
            ax.set_xlabel("Month")
        elif chart_name == "regions":
            data = df.groupby("Region")["Unemployment_Rate"].mean().sort_values()
            sns.barplot(x=data.values, y=data.index, ax=ax)
            ax.set_title("Average Unemployment Rate by Region")
            ax.set_xlabel("Unemployment rate (%)")
        elif chart_name == "area" and "Area" in df.columns:
            sns.barplot(data=df, x="Area", y="Unemployment_Rate", hue="Period", ax=ax)
            ax.set_title("Unemployment by Area and Period")
        else:
            plt.close(fig)
            return jsonify({"error": "Unknown chart or chart is not supported by this dataset."}), 404
        ax.set_ylabel("Unemployment rate (%)")
        fig.tight_layout()
        return jsonify({"image": chart_base64(fig)})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.get("/api/download/cleaned")
def download_cleaned():
    try:
        df = get_data()
        buffer = io.BytesIO()
        df.to_csv(buffer, index=False)
        buffer.seek(0)
        return send_file(buffer, mimetype="text/csv", as_attachment=True,
                         download_name="cleaned_unemployment_data.csv")
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


if __name__ == "__main__":
    try:
        load_default_dataset()
    except Exception as exc:
        print("Could not load default dataset:", exc)
    print("Unemployment Analysis API: http://127.0.0.1:5000")
    if DATA is None:
        print("No default CSV found. Upload one using the web dashboard.")
    app.run(host="127.0.0.1", port=5000, debug=True)
