import { Check } from "lucide-react";
import { DASHBOARDS } from "@/lib/plans";

/** DashboardGo vs DashboardPlus, side by side. */
export function DashboardCompare() {
  return (
    <div className="dash-compare">
      {(["go", "plus"] as const).map((k) => {
        const d = DASHBOARDS[k];
        return (
          <div key={k} className={`dash-card${k === "plus" ? " plus" : ""}`}>
            <span className="tag">{d.name}</span>
            <h3>{d.tagline}</h3>
            <p>{d.summary}</p>
            <ul>
              {d.items.map(([t, s]) => (
                <li key={t}>
                  <Check aria-hidden />
                  <span>
                    {t}
                    <small>{s}</small>
                  </span>
                </li>
              ))}
            </ul>
            <div className="incl">Included with {d.plans}</div>
          </div>
        );
      })}
    </div>
  );
}

