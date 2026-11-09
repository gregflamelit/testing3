import data from "../lib/generated/analytics.json";
import { downloadFile } from "../lib/download";

export function ChartAlternatives({ kind }: { kind: "benchmark" | "errors" | "scatter" }) {
  const labels = { benchmark: "View model benchmark as a table", errors: "View errors by observed score as a table", scatter: "View prediction plot summary and download data" };
  return <details className="chart-alternative"><summary>{labels[kind]}</summary><div className="table-scroll" tabIndex={0} role="region" aria-label={labels[kind]}><table>
    <caption>{kind === "benchmark" ? "Development cross-validation results; lower errors are better" : kind === "errors" ? "Independent test errors by observed score" : "Independent test predictions grouped by observed score"}</caption>
    <thead><tr>{(kind === "benchmark" ? ["Model family", "CV MAE", "CV RMSE", "Configurations"] : kind === "errors" ? ["Observed score", "Samples", "MAE", "Bias"] : ["Observed score", "Samples", "Mean prediction", "Prediction range"]).map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
    <tbody>{kind === "benchmark" ? data.tuning.map(row => <tr key={row.family}><th scope="row">{row.family}</th><td>{row.cv_mae.toFixed(4)}</td><td>{row.cv_rmse.toFixed(4)}</td><td>{row.configurations}</td></tr>) : Object.entries(data.evaluation.by_quality).map(([score, row]) => {
      const values = data.test_predictions.filter(p => p.quality === Number(score)).map(p => p.prediction);
      return <tr key={score}><th scope="row">{score}</th><td>{row.n}</td><td>{kind === "errors" ? row.mae.toFixed(3) : (values.reduce((s, v) => s + v, 0) / values.length).toFixed(3)}</td><td>{kind === "errors" ? row.bias.toFixed(3) : `${Math.min(...values).toFixed(3)}–${Math.max(...values).toFixed(3)}`}</td></tr>;
    })}</tbody></table></div>{kind === "scatter" && <button className="secondary-button" onClick={() => downloadFile("wine-lab-test-predictions.csv", ["observed_quality,predicted_quality", ...data.test_predictions.map(p => `${p.quality},${p.prediction}`)].join("\r\n"))}>Download all 320 plotted samples</button>}</details>;
}
