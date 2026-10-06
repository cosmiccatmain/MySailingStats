"use client";

import { ArrowDownRight, ArrowUpRight, Download, ExternalLink, Search, Star, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Pool, ProgramRoster, Prospect } from "@/lib/recruit";
import { CONFERENCE_DISTRICT, DISTRICT_NAME, collegeClass, districtLabel, openClassYears } from "@/lib/recruit-shared";
import { STAGES, addToBoard, exportBoard, removeFromBoard, saveProgram, updateBoard, useRecruit, type BoardItem, type Program, type Stage } from "@/lib/recruit-store";
import { hasFeature, PLANS } from "@/lib/plans";
import { choosePlan, useWallet } from "@/lib/wallet";
import { ordinal } from "@/lib/format";

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const seasonName = (s: string) => `${s[0] === "f" ? "Fall" : "Spring"} 20${s.slice(1)}`;
const roleLabel = (p: Prospect) => (p.skipper >= 0.7 ? "Skipper" : p.skipper <= 0.3 ? "Crew" : "Skipper / crew");

export function Recruiter() {
  const w = useWallet();
  const { program, board } = useRecruit();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"prospects" | "board" | "program">("prospects");
  const [pool, setPool] = useState<Pool | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const allowed = hasFeature(w.plan, "recruiter");

  useEffect(() => {
    if (!allowed || !program) return;
    let live = true;
    fetch("/api/recruit/prospects")
      .then((r) => r.json())
      .then((j) => live && (j.error ? setErr(j.error) : setPool(j)))
      .catch(() => live && setErr("Couldn't reach Techscore. Try again in a moment."));
    return () => {
      live = false;
    };
  }, [allowed, program]);

  if (!allowed) return <RecruiterGate />;
  if (!program || editing) return <ProgramSetup initial={program} onDone={() => setEditing(false)} />;

  const items = Object.values(board);
  return (
    <div className="rc">
      <header className="dash-head">
        <div className="dash-id">
          <span className="avatar" aria-hidden>
            {initials(program.name)}
          </span>
          <div>
            <h1>{program.name}</h1>
            <div className="sub">
              <span>Recruiter</span>
              {program.conference && <span>{program.conference}</span>}
              {program.district && <span>Home district {districtLabel(program.district)}</span>}
              <span>Recruiting class of {program.classes.join(", ")}</span>
            </div>
          </div>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            Edit program
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!items.length} onClick={() => exportBoard(items, program.name)}>
            <Download aria-hidden /> Export board
          </button>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="Recruiter">
        {(
          [
            ["prospects", "Prospects"],
            ["board", `Board${items.length ? ` (${items.length})` : ""}`],
            ["program", program.kind === "college" ? "Your team" : "Your program"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "prospects" && (pool ? <Prospects pool={pool} program={program} board={board} /> : <Loading err={err} />)}
      {tab === "board" && <Board items={items} onBrowse={() => setTab("prospects")} />}
      {tab === "program" && <ProgramTab program={program} pool={pool} board={items} />}
    </div>
  );
}

// ---------- gate & setup ----------

function RecruiterGate() {
  const p = PLANS.recruiter;
  return (
    <div className="rc">
      <section className="rc-gate fx">
        <span className="tag">Recruiter plan</span>
        <h1>Find your next team before anyone else does.</h1>
        <p>
          Recruiter ranks every high school sailor racing C420s, FJs and Z420s on Techscore by class year, school and district, then lines
          them up against the team you coach.
        </p>
        <ul>
          {p.perks.slice(1, 5).map((x) => (
            <li key={x.text}>{x.text}</li>
          ))}
        </ul>
        <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => choosePlan("recruiter")}>
            Start Recruiter, ${p.price}/month
          </button>
          <Link className="btn btn-ghost btn-lg" href="/pricing?for=enterprise">
            Compare coach plans
          </Link>
        </div>
        <p className="muted small">Demo billing: choosing the plan activates it in this browser and no card is charged.</p>
      </section>
    </div>
  );
}

function ProgramSetup({ initial, onDone }: { initial: Program | null; onDone: () => void }) {
  const years = openClassYears();
  const [kind, setKind] = useState<Program["kind"]>(initial?.kind ?? "college");
  const [colleges, setColleges] = useState<{ slug: string; name: string; conference: string }[]>([]);
  const [collegeName, setCollegeName] = useState(initial?.kind === "college" ? initial.name : "");
  const [clubName, setClubName] = useState(initial?.kind === "club" ? initial.name : "");
  const [district, setDistrict] = useState(initial?.district ?? "");
  const [classes, setClasses] = useState<number[]>(initial?.classes ?? years.slice(0, 2));
  const [focus, setFocus] = useState<Program["focus"]>(initial?.focus ?? "all");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/recruit/colleges")
      .then((r) => r.json())
      .then((j) => setColleges(j.colleges ?? []))
      .catch(() => {});
  }, []);
  const college = colleges.find((c) => c.name.toLowerCase() === collegeName.trim().toLowerCase());
  useEffect(() => {
    if (college && !district) setDistrict(CONFERENCE_DISTRICT[college.conference.toUpperCase()] ?? "");
  }, [college, district]);

  const ok = kind === "college" ? !!college : clubName.trim().length > 1;
  const save = () => {
    if (!ok) return;
    setBusy(true);
    saveProgram({
      kind,
      name: kind === "college" ? college!.name : clubName.trim(),
      college: kind === "college" ? college!.slug : "",
      conference: kind === "college" ? college!.conference : "",
      district,
      classes: classes.length ? [...classes].sort() : years.slice(0, 2),
      focus,
    });
    onDone();
  };

  return (
    <div className="rc">
      <section className="rc-setup fx">
        <h1>{initial ? "Edit your program" : "Set up your program"}</h1>
        <p className="muted">Recruiter uses your program to find local talent, size your recruiting class and spot the schools you already draw from.</p>

        <div className="rc-field">
          <span className="lbl">You coach</span>
          <div className="seg" role="radiogroup">
            {(
              [
                ["college", "A college team"],
                ["club", "A yacht club or high school"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={kind === v} onClick={() => setKind(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {kind === "college" ? (
          <label className="rc-field">
            <span className="lbl">College team</span>
            <input list="rc-colleges" value={collegeName} onChange={(e) => setCollegeName(e.target.value)} placeholder="Start typing, e.g. Stanford University" autoFocus />
            <datalist id="rc-colleges">
              {colleges.map((c) => (
                <option key={c.slug} value={c.name}>
                  {c.conference}
                </option>
              ))}
            </datalist>
            <small className="muted">{college ? `${college.conference} · roster and results from Techscore` : colleges.length ? `${colleges.length} ICSA teams on Techscore` : "Loading teams…"}</small>
          </label>
        ) : (
          <label className="rc-field">
            <span className="lbl">Club or school name</span>
            <input value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="e.g. St. Francis Yacht Club" autoFocus />
          </label>
        )}

        <label className="rc-field">
          <span className="lbl">Home district</span>
          <select value={district} onChange={(e) => setDistrict(e.target.value)}>
            <option value="">Anywhere</option>
            {Object.entries(DISTRICT_NAME).map(([d, n]) => (
              <option key={d} value={d}>
                {d}, {n}
              </option>
            ))}
          </select>
          <small className="muted">High school sailing district closest to you, used for &ldquo;near you&rdquo;.</small>
        </label>

        <div className="rc-field">
          <span className="lbl">Recruiting classes</span>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {years.map((y) => (
              <button
                key={y}
                type="button"
                className={`chip${classes.includes(y) ? " on" : ""}`}
                aria-pressed={classes.includes(y)}
                onClick={() => setClasses((c) => (c.includes(y) ? c.filter((x) => x !== y) : [...c, y]))}
              >
                Class of {y}
              </button>
            ))}
          </div>
        </div>

        <div className="rc-field">
          <span className="lbl">Looking for</span>
          <div className="seg" role="radiogroup">
            {(
              [
                ["all", "Skippers and crews"],
                ["S", "Skippers"],
                ["C", "Crews"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={focus === v} onClick={() => setFocus(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="row" style={{ gap: 12, marginTop: 8 }}>
          <button type="button" className="btn btn-primary btn-lg" disabled={!ok || busy} onClick={save}>
            {initial ? "Save program" : "Find prospects"}
          </button>
          {initial && (
            <button type="button" className="btn btn-ghost btn-lg" onClick={onDone}>
              Cancel
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Loading({ err }: { err: string | null }) {
  if (err) return <p className="rc-empty">{err}</p>;
  return (
    <div className="rc-loading" role="status">
      <div className="loadbar indeterminate">
        <span />
      </div>
      <p className="muted small">Reading two years of high school championship results from Techscore. The first load takes a few seconds.</p>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skel" style={{ height: 44 }} />
      ))}
    </div>
  );
}

// ---------- prospects ----------

type Sort = "score" | "recent" | "national" | "trend";

function Prospects({ pool, program, board }: { pool: Pool; program: Program; board: Record<string, BoardItem> }) {
  const [q, setQ] = useState("");
  const [years, setYears] = useState<number[]>(program.classes);
  const [role, setRole] = useState<Program["focus"]>(program.focus);
  const [region, setRegion] = useState<string>(program.district ? "home" : "all");
  const [sort, setSort] = useState<Sort>("score");
  const [shown, setShown] = useState(40);
  useEffect(() => setShown(40), [q, years, role, region, sort]);

  const open = openClassYears();
  const inClass = useMemo(() => pool.prospects.filter((p) => p.year != null && years.includes(p.year)), [pool, years]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const r = inClass.filter(
      (p) =>
        (role === "all" || (role === "S" ? p.skipper >= 0.5 : p.skipper < 0.5)) &&
        (region === "all" || p.district === (region === "home" ? program.district : region)) &&
        (!needle || p.name.toLowerCase().includes(needle) || p.school.toLowerCase().includes(needle)),
    );
    const key: Record<Sort, (p: Prospect) => number> = {
      score: (p) => p.score,
      recent: (p) => p.recent ?? -1,
      national: (p) => p.national * 100 + p.score / 100,
      trend: (p) => (p.trend == null ? -999 : p.trend),
    };
    return r.sort((a, b) => key[sort](b) - key[sort](a));
  }, [inClass, q, role, region, sort, program.district]);

  // Insights for this program.
  const local = program.district ? inClass.filter((p) => p.district === program.district) : [];
  const topLocal = local.find((p) => p.skipper >= 0.5) ?? local[0];
  const riser = [...inClass].filter((p) => p.trend != null && p.events >= 4).sort((a, b) => b.trend! - a.trend!)[0];
  const schoolCounts = new Map<string, { name: string; n: number; district: string }>();
  for (const p of inClass.slice(0, 100)) {
    const s = schoolCounts.get(p.schoolSlug) ?? { name: p.school, n: 0, district: p.district };
    s.n++;
    schoolCounts.set(p.schoolSlug, s);
  }
  const topSchool = [...schoolCounts.values()].sort((a, b) => b.n - a.n)[0];

  return (
    <div className="tab-panel">
      <section className="kpis">
        <div className="card kpi">
          <div className="k">Prospects in your classes</div>
          <div className="v">{inClass.length.toLocaleString("en-US")}</div>
          <div className="s">Class of {years.length ? years.join(", ") : "—"}</div>
        </div>
        <div className="card kpi">
          <div className="k">Near you</div>
          <div className="v">{program.district ? local.length.toLocaleString("en-US") : "—"}</div>
          <div className="s">{program.district ? `In ${districtLabel(program.district)}` : "Set a home district"}</div>
        </div>
        <div className="card kpi">
          <div className="k">Raced at nationals</div>
          <div className="v">{inClass.filter((p) => p.national > 0).length.toLocaleString("en-US")}</div>
          <div className="s">{inClass.filter((p) => p.natTop5 > 0).length} with a top-5 division finish</div>
        </div>
        <div className="card kpi">
          <div className="k">On your board</div>
          <div className="v">{Object.keys(board).length}</div>
          <div className="s">{Object.values(board).filter((b) => b.stage !== "Watching").length} past Watching</div>
        </div>
      </section>

      <section className="rc-insights">
        {topLocal && (
          <Link className="rc-insight" href={`/recruit/${topLocal.slug}`}>
            <span className="k">Top prospect near you</span>
            <b>{topLocal.name}</b>
            <span>
              Class of {topLocal.year} · {topLocal.school} · score {topLocal.score.toFixed(1)}
            </span>
          </Link>
        )}
        {riser && (
          <Link className="rc-insight" href={`/recruit/${riser.slug}`}>
            <span className="k">Biggest riser this year</span>
            <b>{riser.name}</b>
            <span>
              +{riser.trend} points vs the year before · {riser.school}
            </span>
          </Link>
        )}
        {topSchool && (
          <button type="button" className="rc-insight" onClick={() => setQ(topSchool.name)}>
            <span className="k">Deepest school in your classes</span>
            <b>{topSchool.name}</b>
            <span>
              {topSchool.n} of the top 100 · {districtLabel(topSchool.district) || "—"}
            </span>
          </button>
        )}
      </section>

      <section className="rc-filters" aria-label="Filter prospects">
        <label className="rc-search">
          <Search aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or school" aria-label="Search prospects" />
          {q && (
            <button type="button" className="icon-btn" aria-label="Clear" onClick={() => setQ("")}>
              <X />
            </button>
          )}
        </label>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {open.map((y) => (
            <button
              key={y}
              type="button"
              className={`chip${years.includes(y) ? " on" : ""}`}
              aria-pressed={years.includes(y)}
              onClick={() => setYears((c) => (c.includes(y) ? c.filter((x) => x !== y) : [...c, y].sort()))}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="seg" role="radiogroup" aria-label="Role">
          {(
            [
              ["all", "All"],
              ["S", "Skippers"],
              ["C", "Crews"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={role === v} onClick={() => setRole(v)}>
              {l}
            </button>
          ))}
        </div>
        <select className="compact" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="District">
          <option value="all">All districts</option>
          {program.district && <option value="home">Near you ({program.district})</option>}
          {pool.districts.map((d) => (
            <option key={d} value={d}>
              {districtLabel(d)}
            </option>
          ))}
        </select>
        <select className="compact" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
          <option value="score">Sort: Recruit score</option>
          <option value="recent">Sort: Last 12 months</option>
          <option value="national">Sort: National events</option>
          <option value="trend">Sort: Improving fastest</option>
        </select>
      </section>

      <div className="table-wrap rc-table">
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Sailor</th>
              <th>Class</th>
              <th className="hide-sm">District</th>
              <th className="num hide-sm">Events</th>
              <th className="hide-md">Best result</th>
              <th className="num">Score</th>
              <th aria-label="Board" />
            </tr>
          </thead>
          <tbody>
            {list.slice(0, shown).map((p, i) => (
              <ProspectRow key={p.slug} p={p} rank={i + 1} home={program.district} onBoard={!!board[p.slug]} />
            ))}
          </tbody>
        </table>
        {!list.length && <p className="rc-empty">No prospects match. Try another class year or district.</p>}
      </div>
      {list.length > shown && (
        <button type="button" className="btn btn-secondary" style={{ alignSelf: "center" }} onClick={() => setShown((n) => n + 60)}>
          Show more ({(list.length - shown).toLocaleString("en-US")} left)
        </button>
      )}
      <p className="muted small rc-source">
        From {pool.regattas} championship and national high school regattas on Techscore ({pool.seasons.map(seasonName).reverse().join(" – ")}).
        Recruit score weighs each division finish by event level: national events count fully, district and league championships 85%. Few
        results pull a score towards 40.
      </p>
    </div>
  );
}

function ProspectRow({ p, rank, home, onBoard }: { p: Prospect; rank: number; home: string; onBoard: boolean }) {
  const star = () =>
    onBoard ? removeFromBoard(p.slug) : addToBoard({ slug: p.slug, name: p.name, school: p.school, year: p.year, district: p.district, score: p.score });
  return (
    <tr>
      <td className="num muted">{rank}</td>
      <td>
        <Link className="rc-who" href={`/recruit/${p.slug}`}>
          <b>{p.name}</b>
          <span>
            {p.school} · {roleLabel(p)}
            {home && p.district === home && <em className="rc-near">Near you</em>}
          </span>
        </Link>
      </td>
      <td>{p.year ?? "—"}</td>
      <td className="hide-sm">{p.district || "—"}</td>
      <td className="num hide-sm">
        {p.events}
        {p.national > 0 && <small className="muted"> · {p.national} nat</small>}
      </td>
      <td className="hide-md">
        {p.best ? (
          <span className="rc-best">
            {ordinal(p.best.rank)}/{p.best.teams} <span className="muted">{p.best.regatta}</span>
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="num">
        <span className="rc-score">
          <b>{p.score.toFixed(1)}</b>
          {p.trend != null && Math.abs(p.trend) >= 3 && (
            <span className={`rc-trend ${p.trend > 0 ? "up" : "down"}`} title="Last 12 months vs the year before">
              {p.trend > 0 ? <ArrowUpRight aria-hidden /> : <ArrowDownRight aria-hidden />}
              {Math.abs(p.trend)}
            </span>
          )}
        </span>
        <span className="meter rc-meter" aria-hidden>
          <span style={{ width: `${Math.max(4, Math.min(100, p.score))}%` }} />
        </span>
      </td>
      <td>
        <button type="button" className={`icon-btn rc-star${onBoard ? " on" : ""}`} aria-pressed={onBoard} aria-label={onBoard ? `Remove ${p.name} from board` : `Add ${p.name} to board`} onClick={star}>
          <Star aria-hidden />
        </button>
      </td>
    </tr>
  );
}

// ---------- board ----------

function Board({ items, onBrowse }: { items: BoardItem[]; onBrowse: () => void }) {
  if (!items.length)
    return (
      <div className="tab-panel">
        <div className="rc-empty">
          <p>Your board is empty. Star prospects to track them through your recruiting stages.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={onBrowse}>
            Browse prospects
          </button>
        </div>
      </div>
    );
  return (
    <div className="tab-panel">
      <div className="rc-board">
        {STAGES.map((stage) => {
          const col = items.filter((i) => i.stage === stage).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          return (
            <section key={stage} className="rc-col" aria-label={stage}>
              <h3>
                {stage} <span className="muted">{col.length}</span>
              </h3>
              {col.map((i) => (
                <BoardCard key={i.slug} item={i} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({ item }: { item: BoardItem }) {
  const [note, setNote] = useState(item.note);
  return (
    <article className="rc-card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <Link href={`/recruit/${item.slug}`} className="rc-who">
          <b>{item.name}</b>
          <span>
            {item.year ? `Class of ${item.year} · ` : ""}
            {item.school}
          </span>
        </Link>
        <button type="button" className="icon-btn" aria-label={`Remove ${item.name}`} onClick={() => removeFromBoard(item.slug)}>
          <X />
        </button>
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <select className="compact" value={item.stage} onChange={(e) => updateBoard(item.slug, { stage: e.target.value as Stage })} aria-label="Stage">
          {STAGES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {item.score != null && <span className="small muted">Score {item.score.toFixed(1)}</span>}
      </div>
      <textarea
        value={note}
        placeholder="Notes: contact, visit dates, academics…"
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== item.note && updateBoard(item.slug, { note })}
        rows={2}
      />
    </article>
  );
}

// ---------- program ----------

function ProgramTab({ program, pool, board }: { program: Program; pool: Pool | null; board: BoardItem[] }) {
  const [roster, setRoster] = useState<ProgramRoster | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (program.kind !== "college" || !program.college) return;
    fetch(`/api/recruit/program?${new URLSearchParams({ college: program.college })}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : setRoster(j)))
      .catch(() => setErr("Couldn't load the roster from Techscore."));
  }, [program.kind, program.college]);

  const local = pool && program.district ? pool.prospects.filter((p) => p.district === program.district) : [];
  const byClass = openClassYears().map((y) => ({ y, n: local.filter((p) => p.year === y).length, board: board.filter((b) => b.year === y).length }));

  return (
    <div className="tab-panel">
      {program.kind === "college" && (
        <section className="card">
          <div className="card-head">
            <div>
              <h3>{program.name} roster</h3>
              <p>Current sailors by class year, from Techscore rosters over the last three seasons.</p>
            </div>
            <a className="btn btn-ghost btn-sm" href={`https://scores.collegesailing.org/schools/${program.college}/`} target="_blank" rel="noreferrer">
              Techscore <ExternalLink aria-hidden />
            </a>
          </div>
          {err ? <p className="muted">{err}</p> : !roster ? <div className="skel" style={{ height: 160 }} /> : <RosterView roster={roster} board={board} />}
        </section>
      )}

      {program.district && (
        <section className="card">
          <div className="card-head">
            <div>
              <h3>Talent near you</h3>
              <p>
                Ranked high school sailors in {districtLabel(program.district)}, by class year, and how many you&rsquo;re tracking.
              </p>
            </div>
          </div>
          {!pool ? (
            <div className="skel" style={{ height: 120 }} />
          ) : (
            <div className="rc-classes">
              {byClass.map((c) => (
                <div key={c.y}>
                  <span className="k">Class of {c.y}</span>
                  <b>{c.n}</b>
                  <span className="muted small">
                    {c.board} on your board · arrives fall {c.y}, college class of {collegeClass(c.y)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function RosterView({ roster, board }: { roster: ProgramRoster; board: BoardItem[] }) {
  const years = [...new Set(roster.sailors.map((s) => s.year).filter((y): y is number => y != null))].sort();
  const max = Math.max(1, ...years.map((y) => roster.sailors.filter((s) => s.year === y).length));
  const seniors = years.length ? roster.sailors.filter((s) => s.year === years[0]).length : 0;
  const feeders = new Map<string, number>();
  for (const s of roster.sailors) if (s.hsSchool) feeders.set(s.hsSchool, (feeders.get(s.hsSchool) ?? 0) + 1);
  const districts = new Map<string, number>();
  for (const s of roster.sailors) if (s.hsDistrict) districts.set(s.hsDistrict, (districts.get(s.hsDistrict) ?? 0) + 1);
  const known = roster.sailors.filter((s) => s.hsSchool).length;

  if (!roster.sailors.length) return <p className="muted">No current sailors listed on Techscore for {roster.school}.</p>;
  return (
    <div className="rc-roster">
      <div className="rc-years" role="list">
        {years.map((y) => {
          const n = roster.sailors.filter((s) => s.year === y).length;
          return (
            <div key={y} role="listitem" className="rc-year">
              <span className="k">Class of {y}</span>
              <span className="meter">
                <span style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <b>{n}</b>
            </div>
          );
        })}
      </div>
      <ul className="rc-notes">
        <li>
          <b>{roster.sailors.length}</b> sailors on recent rosters; <b>{seniors}</b> in the class of {years[0]} graduate first.
        </li>
        {known > 0 && (
          <li>
            Where they sailed in high school ({known} matched):{" "}
            {[...districts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([d, n]) => `${districtLabel(d)} ${n}`)
              .join(", ")}
            .
          </li>
        )}
        {feeders.size > 0 && (
          <li>
            Feeder schools:{" "}
            {[...feeders.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([s, n]) => (n > 1 ? `${s} (${n})` : s))
              .join(", ")}
            .
          </li>
        )}
        <li>
          Your board has {board.length} prospect{board.length === 1 ? "" : "s"}
          {board.length ? `, ${board.filter((b) => b.stage === "Committed").length} committed` : ""}.
        </li>
      </ul>
      <details className="rc-list">
        <summary>All {roster.sailors.length} sailors</summary>
        <table>
          <thead>
            <tr>
              <th>Sailor</th>
              <th>Class</th>
              <th>High school</th>
            </tr>
          </thead>
          <tbody>
            {roster.sailors.map((s) => (
              <tr key={s.slug}>
                <td>{s.name}</td>
                <td>{s.year ?? "—"}</td>
                <td className="muted">{s.hsSchool ? `${s.hsSchool}${s.hsDistrict ? ` · ${s.hsDistrict}` : ""}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
