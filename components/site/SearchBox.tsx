"use client";

import { ArrowRight, Mic, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SEARCH_TYPES, type SearchType } from "@/lib/search-types";

type Recognition = {
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null;
  onend: (() => void) | null;
  lang: string;
  interimResults: boolean;
};
type SRWindow = { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function SearchBox(props: { initialQuery?: string; initialType?: SearchType; autoFocus?: boolean; compact?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(props.initialQuery ?? "");
  const [type, setType] = useState<SearchType>(props.initialType ?? "all");
  const [listening, setListening] = useState(false);
  const [canVoice, setCanVoice] = useState(false);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => {
    const w = window as unknown as SRWindow;
    setCanVoice(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  useEffect(() => setQ(props.initialQuery ?? ""), [props.initialQuery]);
  useEffect(() => setType(props.initialType ?? "all"), [props.initialType]);

  const go = (query = q) => {
    const v = query.trim();
    if (v.length < 2) return;
    router.push(`/search?${new URLSearchParams({ q: v, ...(type !== "all" ? { type } : {}) })}`);
  };

  const voice = () => {
    if (listening) return rec.current?.stop();
    const w = window as unknown as SRWindow;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = false;
    r.onresult = (e) => {
      const text = e.results[0][0].transcript.replace(/[.?!]$/, "");
      setQ(text);
      go(text);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  return (
    <div className={`search${props.compact ? " compact" : ""}`}>
      <form
        className="search-pill"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <Search className="lead" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={props.compact ? "Search again" : "Search a sailor, regatta, sail number or club"}
          aria-label="Search regattas, sailors, boats, coaches and clubs"
          autoFocus={props.autoFocus}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
        />
        <select value={type} onChange={(e) => setType(e.target.value as SearchType)} aria-label="Search in">
          {SEARCH_TYPES.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        {canVoice && (
          <button type="button" className={`icon-btn${listening ? " listening" : ""}`} onClick={voice} aria-label={listening ? "Stop listening" : "Search by voice"}>
            <Mic aria-hidden />
          </button>
        )}
        <button className="search-go" type="submit" aria-label="Search">
          <ArrowRight aria-hidden />
        </button>
      </form>
    </div>
  );
}
