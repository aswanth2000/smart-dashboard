# backend/main.py
from urllib import response
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from pydantic import BaseModel
import os
import textwrap
import requests
from openai import OpenAI
from dotenv import load_dotenv
load_dotenv()
from pandas.api.types import (
    is_numeric_dtype,
    is_datetime64_any_dtype,
    is_bool_dtype,
    is_object_dtype,
    is_string_dtype,
)
class AskAIRequest(BaseModel):
    question: str
app = FastAPI()
origins = [
    "http://localhost:5173",
]
data_store = {
    "df": None  # This will hold our uploaded DataFrame
}
# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)
AI_API_URL ="https://models.github.ai/inference"      # e.g. GitHub Models / Azure / OpenAI endpoint
AI_API_KEY = os.getenv("AI_API_KEY")
AI_MODEL_ID = "openai/gpt-4.1"  # e.g. model ID like "openai/gpt-4" or deployment name in Azure

client = OpenAI(
    base_url=AI_API_URL,
    api_key=AI_API_KEY,
)

def get_df():
    df = data_store.get("df")
    if df is None:
        raise HTTPException(status_code=400, detail="No data uploaded yet.")
    return df
def is_identifier_column(series: pd.Series, column_name: str) -> bool:
    """
    Heuristic to detect ID-like columns that should not usually be charted.
    """
    col_lower = column_name.lower()

    # Common naming patterns
    if col_lower.endswith("_id") or col_lower == "id":
        return True

    return False
def is_text_column(series: pd.Series) -> bool:
    """
    Heuristic to detect free-text columns.
    """
    non_null = series.dropna()
    if len(non_null) == 0:
        return False

    # Convert to string safely
    sample = non_null.astype(str).head(50)

    avg_length = sample.str.len().mean()
    unique_ratio = non_null.nunique() / len(non_null)

    # Long values + many unique values usually means free text
    return avg_length > 30 and unique_ratio > 0.5
def infer_column_type(series: pd.Series, column_name: str) -> str:
    """
    Infer a semantic type for a column:
    numeric, datetime, categorical, boolean, identifier, or text
    """
    # Boolean
    if is_bool_dtype(series):
        return "boolean"

    # Datetime
    if is_datetime64_any_dtype(series):
        return "datetime"

    # Numeric
    if is_numeric_dtype(series):
        if is_identifier_column(series, column_name):
            return "identifier"
        return "numeric"

    # Object / string-like
    if is_object_dtype(series) or is_string_dtype(series):
        if is_identifier_column(series, column_name):
            return "identifier"

        if is_text_column(series):
            return "text"

        # Default for short repeated labels
        return "categorical"

    return "categorical"

def profile_dataset(df: pd.DataFrame) -> dict:
    """
    Return a profile of the dataset, including inferred type and
    useful metadata for each column.
    """
    columns_profile = []

    for col in df.columns:
        series = df[col]
        inferred_type = infer_column_type(series, col)

        non_null = series.dropna()

        column_info = {
            "name": col,
            "pandas_dtype": str(series.dtype),
            "inferred_type": inferred_type,
            "null_count": int(series.isna().sum()),
            "unique_count": int(non_null.nunique()),
            "sample_values": [str(v) for v in non_null.head(5).tolist()],
        }

        if inferred_type == "numeric" and len(non_null) > 0:
            column_info["min"] = float(non_null.min())
            column_info["max"] = float(non_null.max())
            column_info["mean"] = float(non_null.mean())

        columns_profile.append(column_info)

    return {
        "row_count": int(len(df)),
        "column_count": int(len(df.columns)),
        "columns": columns_profile,
    }
def get_columns_by_type(profile: dict, inferred_type: str) -> list[str]:
    return [
        col["name"]
        for col in profile["columns"]
        if col["inferred_type"] == inferred_type
    ]
def get_chartable_categorical_columns(profile: dict, max_unique: int = 20) -> list[str]:
    chartable = []
    for col in profile["columns"]:
        if col["inferred_type"] == "categorical" and col["unique_count"] <= max_unique:
            chartable.append(col["name"])
    return chartable
def generate_chart_recommendations(df: pd.DataFrame) -> dict:
    """
    Generate recommended charts based on inferred column types.
    """
    profile = profile_dataset(df)

    numeric_cols = get_columns_by_type(profile, "numeric")
    datetime_cols = get_columns_by_type(profile, "datetime")
    categorical_cols = get_chartable_categorical_columns(profile, max_unique=20)

    charts = []

    # 1. Datetime + numeric -> line charts
    for dt_col in datetime_cols:
        for num_col in numeric_cols[:3]:
            charts.append({
                "id": f"line_{dt_col}_{num_col}_sum",
                "title": f"Total {num_col} over {dt_col}",
                "chart_type": "line",
                "x": dt_col,
                "y": num_col,
                "aggregation": "sum",
            })

    # 2. Categorical + numeric -> bar charts
    for cat_col in categorical_cols[:4]:
        for num_col in numeric_cols[:3]:
            if cat_col != num_col:
                charts.append({
                    "id": f"bar_{cat_col}_{num_col}_sum",
                    "title": f"Total {num_col} by {cat_col}",
                    "chart_type": "bar",
                    "x": cat_col,
                    "y": num_col,
                    "aggregation": "sum",
                })

    # 3. Numeric -> histogram
    for num_col in numeric_cols[:4]:
        charts.append({
            "id": f"hist_{num_col}",
            "title": f"Distribution of {num_col}",
            "chart_type": "histogram",
            "x": num_col,
        })

    # 4. Numeric + numeric -> scatter
    if len(numeric_cols) >= 2:
        seen_pairs = set()
        for i in range(len(numeric_cols)):
            for j in range(i + 1, len(numeric_cols)):
                x_col = numeric_cols[i]
                y_col = numeric_cols[j]
                pair = tuple(sorted((x_col, y_col)))
                if pair not in seen_pairs:
                    seen_pairs.add(pair)
                    charts.append({
                        "id": f"scatter_{x_col}_{y_col}",
                        "title": f"{y_col} vs {x_col}",
                        "chart_type": "scatter",
                        "x": x_col,
                        "y": y_col,
                    })

    # Limit total chart count so the UI stays manageable
    return {
        "charts": charts[:10]
    }
def build_data_summary(df: pd.DataFrame) -> str:
    """
    Build a concise, human-readable summary of the current dataset
    to send as context to the LLM.
    """
    # df=get_df()
    total_sales = float(df["total_price"].sum())
    total_orders = int(df["order_id"].nunique())
    total_quantity = int(df["quantity"].sum())

    by_region = (
        df.groupby("region")["total_price"]
        .sum()
        .sort_values(ascending=False)
        .head(5)
    )
    by_category = (
        df.groupby("product_category")["total_price"]
        .sum()
        .sort_values(ascending=False)
        .head(5)
    )

    lines = []
    lines.append("This is a tabular dataset of sales orders.")
    lines.append(f"Total sales: {total_sales:.2f}")
    lines.append(f"Total orders: {total_orders}")
    lines.append(f"Total quantity sold: {total_quantity}")

    lines.append("\nTop regions by total sales:")
    for region, value in by_region.items():
        lines.append(f"- {region}: {float(value):.2f}")

    lines.append("\nTop product categories by total sales:")
    for cat, value in by_category.items():
        lines.append(f"- {cat}: {float(value):.2f}")

    lines.append(
        "\nEach row has columns: order_id, order_date, region, "
        "product_category, product_name, quantity, unit_price, total_price."
    )

    return "\n".join(lines)
@app.get("/ping")
def ping():
    return {"message": "Backend is alive 🚀"}

@app.post("/upload-csv/")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a CSV file.")
    
    try:
        df=pd.read_csv(file.file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading CSV file: {e}")
    required_columns = [
        "order_id",
        "order_date",
        "region",
        "product_category",
        "product_name",
        "quantity",
        "unit_price",
    ]
    missing=[col for col in required_columns if col not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required columns: {', '.join(missing)}")
    try:
        df['order_date'] = pd.to_datetime(df['order_date'])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing order_date: {e}")
    for col in ["quantity", "unit_price"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    if df["quantity"].isna().any() or df["unit_price"].isna().any():
        raise HTTPException(
            status_code=400,
            detail="Some 'quantity' or 'unit_price' values are not numeric.",
        )
    if "total_price" not in df.columns:
        df["total_price"] = df["quantity"] * df["unit_price"]
    data_store["df"] = df
    return {
        "message": "CSV uploaded successfully",
        "rows": len(df),
        "columns": list(df.columns),
    }
@app.get("/summary")
def get_summary():
    df=get_df()
    total_sales = float(df["total_price"].sum())
    total_orders=int(df["order_id"].nunique())
    total_quantity = int(df["quantity"].sum())
    avg_order_value = float(total_sales / total_orders) if total_orders > 0 else 0.0
    min_date = df["order_date"].min()
    max_date = df["order_date"].max()
    return {
        "total_sales": total_sales,
        "total_orders": total_orders,
        "total_quantity": total_quantity,
        "avg_order_value": avg_order_value,
        "date_range": {
            "start_date": min_date.date().isoformat() if not pd.isna(min_date) else None,
            "end_date": max_date.date().isoformat() if not pd.isna(max_date) else None,
        },
    }

@app.get("/timeseries-sales/")
def timeseries_sales():
    df=get_df()
    grouped=(df.groupby(df["order_date"].dt.date)["total_price"]
             .sum()
             .reset_index(name="total_sales"))
    records=[
        {
            "date": row["order_date"].isoformat(),
            "total_sales": float(row["total_sales"]),
        }
        for _, row in grouped.iterrows()

    ]
    return {"timeseries_sales": records}

@app.get("/sales-by-category/")
def sales_by_category():
    df=get_df()
    grouped=(
        df.groupby("product_category")["total_price"].sum().reset_index(name="total_sales").sort_values("total_sales", ascending=False)
    )
    records=[
        {
            "category": row["product_category"],
            "total_sales": float(row["total_sales"]),
        }
        for _, row in grouped.iterrows()
    ]
    return {"sales_by_category": records}

@app.get("/sales-by-region/")
def sales_by_region():
    df=get_df()
    grouped=(
        df.groupby("region")["total_price"].sum().reset_index(name="total_sales").sort_values("total_sales", ascending=False)
    )
    records=[
        {
            "region": row["region"],
            "total_sales": float(row["total_sales"]),
        }
        for _, row in grouped.iterrows()
    ]
    return {"sales_by_region": records}

@app.get("/profile-data")
def profile_data():
    df = get_df()
    return profile_dataset(df)

@app.get("/recommended-charts")
def recommended_charts():
    df = get_df()
    return generate_chart_recommendations(df)

@app.get("/chart-data")
def chart_data(chart_type: str, x: str, y: str = None, aggregation: str = None):
    """
    Return processed chart data for a requested chart configuration.
    """
    df = get_df()

    if x not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{x}' not found.")

    if y and y not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{y}' not found.")

    # Line chart: datetime/categorical + numeric aggregation
    if chart_type == "line":
        if not y or not aggregation:
            raise HTTPException(status_code=400, detail="line chart requires x, y, and aggregation")

        grouped = (
            df.groupby(df[x].dt.date if pd.api.types.is_datetime64_any_dtype(df[x]) else df[x])[y]
            .agg(aggregation)
            .reset_index(name=y)
        )

        records = []
        for _, row in grouped.iterrows():
            x_value = row[x]
            if hasattr(x_value, "isoformat"):
                x_value = x_value.isoformat()

            records.append({
                x: x_value,
                y: float(row[y]),
            })

        return {"data": records}

    # Bar chart: categorical + numeric aggregation
    elif chart_type == "bar":
        if not y or not aggregation:
            raise HTTPException(status_code=400, detail="bar chart requires x, y, and aggregation")

        grouped = (
            df.groupby(x)[y]
            .agg(aggregation)
            .reset_index(name=y)
            .sort_values(y, ascending=False)
        )

        records = [
            {
                x: row[x],
                y: float(row[y]),
            }
            for _, row in grouped.iterrows()
        ]
        return {"data": records}

    # Histogram: one numeric column
    elif chart_type == "histogram":
        values = pd.to_numeric(df[x], errors="coerce").dropna()
        return {"data": [{x: float(v)} for v in values.tolist()]}

    # Scatter: two numeric columns
    elif chart_type == "scatter":
        if not y:
            raise HTTPException(status_code=400, detail="scatter chart requires x and y")

        clean_df = df[[x, y]].dropna()
        records = [
            {
                x: float(row[x]),
                y: float(row[y]),
            }
            for _, row in clean_df.iterrows()
        ]
        return {"data": records}

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported chart_type: {chart_type}")

@app.get("/test-ai")
def test_ai_connection():
    response = client.chat.completions.create(
    messages=[
        {
            "role": "system",
            "content": "",
        },
        {
            "role": "user",
            "content": "What is the capital of France?",
        }
    ],
    model=AI_MODEL_ID
    )

    res=response.choices[0].message.content
    return {"response": res}
@app.post("/ask-ai")
def ask_ai(payload: AskAIRequest):
    """
    Take a natural-language question, look at the current dataset,
    and ask the LLM (GitHub Models via OpenAI client) to answer
    based ONLY on the dataset summary.
    """
    df = get_df()

    user_question = payload.question.strip()
    if not user_question:
        raise HTTPException(status_code=400, detail="Question must not be empty.")

    data_summary = build_data_summary(df)

    prompt = textwrap.dedent(f"""
    You are a data analyst. You will be given a description of a sales dataset
    and a question about it. Answer based ONLY on the data in the description.
    If the answer can't be determined from the data, say that honestly.

    DATA SUMMARY:
    {data_summary}

    QUESTION:
    {user_question}
    """)

    # Safety: if API key isn't set properly, return a fallback instead of crashing
    if not AI_API_KEY or AI_API_KEY.startswith("#"):
        # tiny rule-based fallback so frontend still works
        top_region = (
            df.groupby("region")["total_price"]
            .sum()
            .sort_values(ascending=False)
            .idxmax()
        )
        fallback = (
            "AI integration is not fully configured yet (missing a real API key).\n\n"
            f"However, based on the data, the top performing region by sales is: {top_region}.\n"
            "Once a valid key is set, I will provide full natural language answers."
        )
        return {"answer": fallback}

    try:
        response = client.chat.completions.create(
            model=AI_MODEL_ID,  # "openai/gpt-4.1" via GitHub Models
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful data analyst.",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
        )

        answer = response.choices[0].message.content
        return {"answer": answer}

    except Exception as e:
        # Wrap any error in a clean HTTP response
        raise HTTPException(status_code=500, detail=f"Error calling AI API: {e}")

