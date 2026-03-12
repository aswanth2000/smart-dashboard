import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  ScatterChart,
  Scatter,
} from "recharts";

const BACKEND_URL = "http://localhost:8000";

function App() {
  const [summary, setSummary] = useState(null);
const [recommendedCharts, setRecommendedCharts] = useState([]);
const [chartResults, setChartResults] = useState({});
  const [byRegion, setByRegion] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  // Fetch all analytics data when the app first loads
  // useEffect(() => {
  //   async function fetchData() {
  //     try {
  //       setLoading(true);
  //       setError(null);

  //       const [summaryRes, tsRes, catRes, regRes] = await Promise.all([
  //         fetch(`${BACKEND_URL}/summary`),
  //         fetch(`${BACKEND_URL}/timeseries-sales`),
  //         fetch(`${BACKEND_URL}/sales-by-category`),
  //         fetch(`${BACKEND_URL}/sales-by-region`),
  //       ]);

  //       if (!summaryRes.ok || !tsRes.ok || !catRes.ok || !regRes.ok) {
  //         throw new Error("One or more backend requests failed");
  //       }
        

  //       const summaryData = await summaryRes.json();
  //       const tsData = await tsRes.json();
  //       const catData = await catRes.json();
  //       const regData = await regRes.json();
  //       console.log("Fetched all analytics data successfully.",{summaryData, tsData, catData, regData});
  //       setSummary(summaryData);
  //       setTimeseries(tsData.timeseries_sales || []);
  //       setByCategory(catData.sales_by_category || []);
  //        setByRegion(regData.sales_by_region || []);
  //       console.log("State:",{summary, timeseries, byCategory, byRegion});
  //     } catch (err) {
  //       console.error("Error fetching analytics:", err);
  //       setError(err.message);
  //     } finally {
  //       setLoading(false);
  //     }
  //   }

  //   fetchData();
  // }, []);
  useEffect(() => {
  async function fetchDashboardData() {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch summary + chart recommendations
      const [summaryRes, chartsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/summary`),
        fetch(`${BACKEND_URL}/recommended-charts`),
      ]);

      if (!summaryRes.ok || !chartsRes.ok) {
        throw new Error("Failed to fetch dashboard metadata");
      }

      const summaryData = await summaryRes.json();
      const chartsData = await chartsRes.json();

      const charts = chartsData.charts || [];

      setSummary(summaryData);
      setRecommendedCharts(charts);

      // 2. Fetch data for each recommended chart
      const chartDataEntries = await Promise.all(
        charts.map(async (chart) => {
          const params = new URLSearchParams({
            chart_type: chart.chart_type,
            x: chart.x,
          });

          if (chart.y) params.append("y", chart.y);
          if (chart.aggregation) params.append("aggregation", chart.aggregation);

          const res = await fetch(`${BACKEND_URL}/chart-data?${params.toString()}`);

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Failed to fetch chart data for ${chart.id}: ${errText}`);
          }

          const data = await res.json();

          return [chart.id, data.data || []];
        })
      );

      const chartResultsMap = Object.fromEntries(chartDataEntries);
      setChartResults(chartResultsMap);

    } catch (err) {
      console.error("Error fetching dashboard:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  fetchDashboardData();
}, []);
  async function handleAskAI(e) {
  e.preventDefault();

  const q = aiQuestion.trim();
  if (!q) return;

  try {
    setAiLoading(true);
    setAiError(null);
    setAiAnswer("");

    const res = await fetch(`${BACKEND_URL}/ask-ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    setAiAnswer(data.answer || "");
  } catch (err) {
    console.error("Error asking AI:", err);
    setAiError(err.message);
  } finally {
    setAiLoading(false);
  }
}


  if (loading) {
    return (
      <div style={{ fontFamily: "sans-serif", padding: "2rem" }}>
        <h1>Smart Analytics Dashboard</h1>
        <p>Loading analytics…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: "sans-serif", padding: "2rem" }}>
        <h1>Smart Analytics Dashboard</h1>
        <p style={{ color: "red" }}>Error: {error}</p>
        <p>
          Make sure the backend is running and a CSV has been uploaded via
          <code> /upload-csv</code>.
        </p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div style={{ fontFamily: "sans-serif", padding: "2rem" }}>
        <h1>Smart Analytics Dashboard</h1>
        <p>No summary data available.</p>
      </div>
    );
  }

  const {
    total_sales,
    total_orders,
    total_quantity,
    avg_order_value,
    date_range,
  } = summary;

function SummaryCard({ label, value, prefix }) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: "0.75rem",
        padding: "1rem",
        boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
        background: "#fff",
      }}
    >
      <div
        style={{
          fontSize: "0.9rem",
          color: "#666",
          marginBottom: "0.25rem",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: 600,color:"black" }}>
        {prefix ? `${prefix}${value}` : value}
      </div>
    </div>
  );
  
}
function DynamicChart({ chart, data }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: "1rem", color: "#bbb" }}>
        No data available for this chart.
      </div>
    );
  }

  const commonAxisStyle = { fill: "#fff", fontSize: 12 };

  return (
    <div
      style={{
        border: "1px solid #333",
        borderRadius: "1rem",
        padding: "1rem",
        background: "#1e1e1e",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>{chart.title}</h3>

      {chart.chart_type === "line" && (
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis dataKey={chart.x} tick={commonAxisStyle} />
              <YAxis tick={commonAxisStyle} />
              <Tooltip contentStyle={{ backgroundColor: "#333", border: "none" }} />
              <Legend verticalAlign="bottom" height={36} />
              <Line type="monotone" dataKey={chart.y} stroke="#82ca9d" name={chart.y} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {chart.chart_type === "bar" && (
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis
                dataKey={chart.x}
                angle={-30}
                textAnchor="end"
                interval={0}
                tick={commonAxisStyle}
              />
              <YAxis tick={commonAxisStyle} />
              <Tooltip contentStyle={{ backgroundColor: "#333", border: "none" }} />
              <Legend verticalAlign="bottom" height={36} />
              <Bar dataKey={chart.y} fill="#8884d8" name={chart.y} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {chart.chart_type === "scatter" && (
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid stroke="#444" />
              <XAxis
                type="number"
                dataKey={chart.x}
                name={chart.x}
                tick={commonAxisStyle}
              />
              <YAxis
                type="number"
                dataKey={chart.y}
                name={chart.y}
                tick={commonAxisStyle}
              />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Scatter name={chart.title} data={data} fill="#ffb347" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {chart.chart_type === "histogram" && (
        <HistogramLikeChart chart={chart} data={data} />
      )}
    </div>
  );
}
function HistogramLikeChart({ chart, data }) {
  const values = data
    .map((row) => Number(row[chart.x]))
    .filter((v) => !Number.isNaN(v));

  if (values.length === 0) {
    return <p>No histogram data available.</p>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const binCount = 8;
  const binSize = max === min ? 1 : (max - min) / binCount;

  const bins = Array.from({ length: binCount }, (_, i) => {
    const start = min + i * binSize;
    const end = i === binCount - 1 ? max : start + binSize;
    return {
      bin: `${start.toFixed(1)} - ${end.toFixed(1)}`,
      count: 0,
      start,
      end,
    };
  });

  values.forEach((value) => {
    let index = Math.floor((value - min) / binSize);
    if (index >= binCount) index = binCount - 1;
    if (index < 0) index = 0;
    bins[index].count += 1;
  });

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <BarChart data={bins} margin={{ top: 20, right: 20, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />
          <XAxis
            dataKey="bin"
            angle={-25}
            textAnchor="end"
            interval={0}
            tick={{ fill: "#fff", fontSize: 11 }}
          />
          <YAxis tick={{ fill: "#fff", fontSize: 12 }} />
          <Tooltip contentStyle={{ backgroundColor: "#333", border: "none" }} />
          <Legend verticalAlign="bottom" height={36} />
          <Bar dataKey="count" fill="#40c9a2" name="Count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
  return (
    <div
      style={{
        fontFamily: "sans-serif",
        padding: "2rem",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <h1>Smart Analytics Dashboard</h1>
      <p style={{ color: "#555" }}>
        Date range: {date_range?.start} → {date_range?.end}
      </p>

      {/* Summary cards */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
          marginTop: "1.5rem",
        }}
      >
        <SummaryCard
          label="Total Sales"
          value={total_sales.toFixed(2)}
          prefix="€"
        />
        <SummaryCard label="Total Orders" value={total_orders} />
        <SummaryCard label="Total Quantity" value={total_quantity} />
        <SummaryCard
          label="Avg Order Value"
          value={avg_order_value.toFixed(2)}
          prefix="€"
        />
      </section>

      {/* Charts */}
      {/* <section style={{ marginTop: "2rem" }}>
        <h2>Sales Over Time</h2>
        {timeseries.length === 0 ? (
          <p>No timeseries data available.</p>
        ) : (
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={timeseries} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total_sales"
                  name="Total Sales"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section
        style={{
          marginTop: "2rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "2rem",
        }}
      >
        <div>
          <h2>Sales by Category</h2>
          {byCategory.length === 0 ? (
            <p>No category data available.</p>
          ) : (
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <BarChart 
                data={byCategory} 
                margin={{ top: 20, right: 10, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="category"
              
                    interval={0}
                    tick={{ fill: "#fff", fontSize: 12 }}
                  />
                  <YAxis tick={{ fill: "#fff", fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: "#333", color: "#fff" }} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                     wrapperStyle={{ color: "#fff" }}
                   />
                  <Bar dataKey="total_sales" name="Total Sales" fill="#8884d8" barSize={50}   />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div>
          <h2>Sales by Region</h2>
          {byRegion.length === 0 ? (
            <p>No region data available.</p>
          ) : (
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={byRegion} margin={{ top: 20, right: 20, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="region"   interval={0}   tick={{ fill: "#fff", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#fff", fontSize: 12 }} />
                  <Tooltip  contentStyle={{ backgroundColor: "#333", color: "#fff" }}/>
                  <Legend verticalAlign="bottom"
        height={36}
        wrapperStyle={{ color: "#fff" }}/>
                  <Bar dataKey="total_sales" name="Total Sales"  fill="#ffc658" barSize={50} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section> */}

            {/* AI Assistant */}
            <section style={{ marginTop: "2rem" }}>
        <h2>Recommended Charts</h2>

        {recommendedCharts.length === 0 ? (
          <p>No chart recommendations available.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
              gap: "1.5rem",
              marginTop: "1rem",
            }}
          >
            {recommendedCharts.map((chart) => (
              <DynamicChart
                key={chart.id}
                chart={chart}
                data={chartResults[chart.id] || []}
              />
            ))}
          </div>
        )}
      </section>
      
      <section style={{ marginTop: "3rem" }}>
        <h2>Ask AI About This Data</h2>
        <p style={{ color: "#bbb", maxWidth: "700px" }}>
          Type a question about the uploaded sales data (e.g. "Which region is
          performing best?" or "Summarize the key insights."). The backend sends
          a summary of the dataset to the AI model and returns the answer.
        </p>

        <form onSubmit={handleAskAI} style={{ marginTop: "1rem" }}>
          <textarea
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            rows={3}
            placeholder='Ask something like: Which product category contributes most to revenue?'
            style={{
              width: "100%",
              maxWidth: "700px",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid #555",
              background: "#222",
              color: "#fff",
              resize: "vertical",
            }}
          />
          <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
            <button
              type="submit"
              disabled={aiLoading || !aiQuestion.trim()}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                border: "none",
                background: aiLoading ? "#555" : "#4caf50",
                color: "#fff",
                cursor: aiLoading ? "default" : "pointer",
                fontWeight: 600,
              }}
            >
              {aiLoading ? "Thinking…" : "Ask AI"}
            </button>
            {aiError && (
              <span style={{ color: "#ff6b6b", alignSelf: "center" }}>
                {aiError}
              </span>
            )}
          </div>
        </form>

        {aiAnswer && (
          <div
            style={{
              marginTop: "1.5rem",
              maxWidth: "700px",
              padding: "1rem",
              borderRadius: "0.75rem",
              border: "1px solid #555",
              background: "#1a1a1a",
              whiteSpace: "pre-wrap",
            }}
          >
            {aiAnswer}
          </div>
        )}
      </section>

    </div>
  );
}


export default App;
