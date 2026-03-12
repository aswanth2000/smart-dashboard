# Smart Analytics Dashboard with AI Insights

## Goal

A web-based dashboard where a user can upload a CSV file containing e-commerce sales data, see summary metrics and charts, and ask an AI questions about the data.
    
## Dataset (Initial Assumption)

Each row represents an order.

Columns:
- order_id
- order_date
- region
- product_category
- product_name
- quantity
- unit_price
- total_price (can be derived)

## MVP Features

1. Upload a CSV file.
2. Compute and display summary metrics:
   - Total sales
   - Total number of orders
   - Total quantity sold
   - Average order value
3. Show charts:
   - Sales over time (by date)
   - Sales by product category
   - Sales by region
4. Ask-AI box:
   - User types questions in natural language.
   - AI answers based on data summaries computed by the backend.

## Tech Stack

- Backend: Python + FastAPI + Pandas
- Frontend: React + Vite + Vega-Lite (via react-vega)
- AI: OpenAI API (called from the backend)

## Architecture (High-Level)

- Frontend handles:
  - File upload UI
  - Displaying summary cards and charts
  - Text input and display for AI answers

- Backend handles:
  - CSV upload and parsing (Pandas DataFrame)
  - Aggregation and summary APIs for charts and metrics
  - AI question endpoint that:
    - Reads data
    - Pre-computes relevant stats
    - Calls LLM with a structured prompt
