const BackendBaseUrl = "https://api.unknown-technologies.net/status_api";
const FallbackHistoryUrl = "/history.fallback.json";
const PollIntervalMs = 5000;
let _UsingFallbackHistory = false;
let _FallbackDaily = {};

function NodeSlug(Name) {
    return Name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function SetBanner(TitleText, BodyText, IsVisible) {
    const Banner    = document.getElementById("Banner");
    const BannerTitle = document.getElementById("BannerTitle");
    const BannerText  = document.getElementById("BannerText");
    Banner.hidden = !IsVisible;
    if (!IsVisible) return;
    BannerTitle.textContent = TitleText;
    BannerText.textContent  = BodyText;

}

function SetLastUpdated(Text) {
    document.getElementById("LastUpdated").textContent = Text;
}

function SafeJsonParse(Text) {
    try { return JSON.parse(Text); } catch { return null; }
}

function GetBarClass(State) {
    return {
        up: "BarUp",
        degraded: "BarDegraded",
        down: "BarDown",
        nodata: "BarNoData",
    }[State] || "BarNoData";
}

function DayHumanSummary(Checks, Failures) {
    if (!Checks) return "No data recorded for this day.";
    if (!Failures) return "Fully operational. " + Checks + " checks, all passed.";
    const Uptime = Math.round((1 - Failures / Checks) * 1000) / 10;
    return Failures + " of " + Checks + " checks failed (" + Uptime + "% uptime).";
}



// ── Day detail panel ──────────────────────────────────────────────────────────

let _OpenPanel = null; // { rowId, date }

function CloseDayPanel() {
    if (!_OpenPanel) return;
    const Row = document.getElementById(_OpenPanel.rowId);
    if (Row) {
        const Panel = Row.querySelector(".DayPanel");
        if (Panel) {
            Panel.classList.remove("DayPanelOpen");
            setTimeout(() => { if (Panel.parentNode) Panel.parentNode.removeChild(Panel); }, 300);
        }
        Row.querySelectorAll(".Bar.BarSelected").forEach(b => b.classList.remove("BarSelected"));
    }
    _OpenPanel = null;
}

async function OpenDayPanel(NodeSlug, Date, BarEl, RowEl) {
    const RowId = RowEl.id;

    // Toggle: same bar closes
    if (_OpenPanel && _OpenPanel.rowId === RowId && _OpenPanel.date === Date) {
        CloseDayPanel();
        return;
    }

    CloseDayPanel();
    _OpenPanel = { rowId: RowId, date: Date };
    BarEl.classList.add("BarSelected");

    // Build panel and insert it right after .BarWrap (stable anchor)
    const Panel = document.createElement("div");
    Panel.className = "DayPanel";
    const Loading = document.createElement("div");
    Loading.className = "DayPanelLoading";
    Loading.textContent = "Loading " + Date + "…";
    Panel.appendChild(Loading);

    const BarWrap = RowEl.querySelector(".BarWrap");
    BarWrap.insertAdjacentElement("afterend", Panel);

    // Animate open
    requestAnimationFrame(() => requestAnimationFrame(() => Panel.classList.add("DayPanelOpen")));

    try {
        let Data = null;
        if (!_UsingFallbackHistory) {
            const Res = await fetch(BackendBaseUrl + "/api/day/" + NodeSlug + "/" + Date, {
                cache: "no-store",
                headers: { "Accept": "application/json", "ngrok-skip-browser-warning": "true" }
            });
            Data = SafeJsonParse(await Res.text());
            if (!Data || !Res.ok) throw new Error("Bad response");
        } else {
            const Bucket = ((_FallbackDaily || {})[NodeSlug] || {})[Date] || { checks: 0, failures: 0 };
            const Checks = Number(Bucket.checks || 0);
            const Failures = Number(Bucket.failures || 0);
            Data = {
                NodeName: NodeSlug,
                Date,
                TotalChecks: Checks,
                TotalFailures: Failures,
                UptimePct: Checks ? Math.round((1 - Failures / Checks) * 10000) / 100 : null,
                State: GetDayState(Bucket),
                Summary: DayHumanSummary(Checks, Failures),
            };
        }
        RenderDayPanel(Panel, Data, Date);
    } catch (Err) {
        console.warn("Day detail fetch failed:", Err);
        const ErrorMessage = document.createElement("div");
        ErrorMessage.className = "DayPanelError";
        ErrorMessage.textContent = "Failed to load detail for " + Date;
        Panel.replaceChildren(ErrorMessage);
    }
}

function GetDayState(Bucket) {
    const Checks = Number(Bucket?.checks || 0);
    const Failures = Number(Bucket?.failures || 0);
    if (!Checks) return "nodata";
    const Ratio = Failures / Checks;
    if (Ratio < 0.01) return "up";
    if (Ratio < 0.5) return "degraded";
    return "down";
}

function RenderDayPanel(Panel, Data, Date) {
    const RawPct = Data.UptimePct;
    const PctClass = RawPct == null ? "pct-warn" : RawPct >= 99 ? "pct-good" : RawPct >= 80 ? "pct-warn" : "pct-bad";
    const StateIcon = Data.State === "up" ? "▲" : Data.State === "down" ? "▼" : "●";
    const IconClass = Data.State === "up" ? "pct-good" : Data.State === "down" ? "pct-bad" : "pct-warn";

    const Header = document.createElement("div");
    Header.className = "DayPanelHeader";

    const DateText = document.createElement("span");
    DateText.className = "DayPanelDate";
    DateText.textContent = Date;

    const Checks = document.createElement("span");
    Checks.className = "DayPanelStat";
    Checks.textContent = Number(Data.TotalChecks || 0) + " checks";

    const Uptime = document.createElement("span");
    Uptime.classList.add("DayPanelStat", "DayPanelUptimePct", PctClass);
    Uptime.textContent = RawPct != null ? Number(RawPct).toFixed(2) + "% uptime" : "No data";

    const CloseButton = document.createElement("button");
    CloseButton.className = "DayPanelClose";
    CloseButton.type = "button";
    CloseButton.textContent = "✕";
    CloseButton.setAttribute("aria-label", "Close day details");
    CloseButton.addEventListener("click", CloseDayPanel);
    Header.append(DateText, Checks, Uptime, CloseButton);

    const Summary = document.createElement("div");
    Summary.className = "DaySummaryBody";

    const Icon = document.createElement("span");
    Icon.classList.add("DaySummaryIcon", IconClass);
    Icon.textContent = StateIcon;

    const SummaryText = document.createElement("span");
    SummaryText.className = "DaySummaryText";
    SummaryText.textContent = Data.Summary || "No data recorded for this day.";
    Summary.append(Icon, SummaryText);

    Panel.replaceChildren(Header, Summary);
}

// ── Row builder ───────────────────────────────────────────────────────────────

function BuildOrUpdateRow(Node, Container) {
    const Slug = Node.Slug || NodeSlug(Node.Name);
    let Row = document.getElementById("Row-" + Slug);

    const IsUp      = Boolean(Node.IsUp);
    const IsUnknown = Boolean(Node.IsUnknown);
    const IsBackend = Boolean(Node.IsBackend);
    const DotClass    = IsUnknown ? "dot-unknown" : (IsUp ? "dot-up" : "dot-down");
    const StatusClass = IsUnknown ? "status-unknown" : (IsUp ? "status-up" : "status-down");

    // Backend nodes are always-up so uptime % is meaningless — hide it.
    // For real nodes: show 24h figure prominently, 90d as secondary.
    let UptimeText = "";
    if (!IsBackend) {
        const Pct24h = Node.UptimePct24h;
        const PctAll = Node.UptimePctAll;
        if (Pct24h != null) {
            UptimeText = Pct24h.toFixed(2) + "% (24h)";
            if (PctAll != null) UptimeText += "  \u00b7  " + PctAll.toFixed(2) + "% (90d)";
        }
    }

    // ── Create row skeleton once ──
    if (!Row) {
        Row = document.createElement("div");
        Row.className = "Row";
        Row.id = "Row-" + Slug;

        const Header  = document.createElement("div"); Header.className  = "RowHeader"; Row.appendChild(Header);
        const BarWrap = document.createElement("div"); BarWrap.className = "BarWrap";   Row.appendChild(BarWrap);
        // DayPanel goes here (injected dynamically)
        const Labels  = document.createElement("div"); Labels.className  = "TimeLabels";
        const OldestLabel = document.createElement("span");
        OldestLabel.textContent = "‹ 90 DAYS AGO";
        const TodayLabel = document.createElement("span");
        TodayLabel.textContent = "TODAY";
        Labels.append(OldestLabel, TodayLabel);
        Row.appendChild(Labels);
        const Sep = document.createElement("div"); Sep.className = "RowSep"; Row.appendChild(Sep);

        Container.appendChild(Row);
    }

    // ── Update header ──
    const Header = Row.querySelector(".RowHeader");
    const RowLeft = document.createElement("div");
    RowLeft.className = "RowLeft";

    const Dot = document.createElement("span");
    Dot.classList.add("Dot", DotClass);

    const Name = document.createElement("span");
    Name.className = "NodeName";
    Name.textContent = Node.Name;
    RowLeft.append(Dot, Name);

    if (Node.Description) {
        const Description = document.createElement("span");
        Description.className = "NodeDesc";
        Description.textContent = Node.Description;
        RowLeft.appendChild(Description);
    }

    const Uptime = document.createElement("div");
    Uptime.classList.add("UptimePct", StatusClass);
    Uptime.textContent = UptimeText;
    Header.replaceChildren(RowLeft, Uptime);

    // ── Rebuild bars (but keep any open DayPanel in place) ──
    const BarWrap = Row.querySelector(".BarWrap");
    BarWrap.replaceChildren();

    const History = Node.History || [];
    for (const Entry of History) {
        const Bar = document.createElement("div");
        Bar.classList.add("Bar", GetBarClass(Entry.state));

        const StateLabel = { up: "Operational", degraded: "Degraded", down: "Outage", nodata: "No data" }[Entry.state] || "Unknown";
        const Clickable  = Entry.state !== "nodata";

        Bar.title = Entry.date + "  •  " + StateLabel + (Clickable ? "  —  click for details" : "");

        if (Clickable) {
            Bar.classList.add("BarClickable");
            Bar.addEventListener("click", (function(barEl, slug, date, rowEl) {
                return function(e) {
                    e.stopPropagation();
                    OpenDayPanel(slug, date, barEl, rowEl);
                };
            })(Bar, Slug, Entry.date, Row));
        }

        BarWrap.appendChild(Bar);
    }

    // Re-apply BarSelected highlight if this row's panel is still open
    if (_OpenPanel && _OpenPanel.rowId === Row.id) {
        const Bars = BarWrap.querySelectorAll(".Bar");
        History.forEach((Entry, i) => {
            if (Entry.date === _OpenPanel.date && Bars[i]) Bars[i].classList.add("BarSelected");
        });
    }
}

// ── Main poll loop ────────────────────────────────────────────────────────────

async function FetchFallbackHistory() {
    const Response = await fetch(FallbackHistoryUrl + "?t=" + Date.now(), {
        cache: "no-store",
        headers: { "Accept": "application/json" }
    });
    const Data = SafeJsonParse(await Response.text());
    if (!Response.ok || !Data || !Array.isArray(Data.Nodes)) throw new Error("Fallback unavailable");
    _UsingFallbackHistory = true;
    _FallbackDaily = Data.Daily || {};
    const Container = document.getElementById("NodeList");
    for (const Node of Data.Nodes) {
        Node.IsUnknown = true;
        Node.StatusText = "Historical";
        BuildOrUpdateRow(Node, Container);
    }
    const GeneratedAtUnix = Number(Data.GeneratedAtUnix || 0);
    SetLastUpdated(GeneratedAtUnix > 0
        ? "Showing mirrored history from " + new Date(GeneratedAtUnix * 1000).toLocaleString()
        : "Showing mirrored history");
    SetBanner("⚠ Live Status Unavailable", "Showing historical fallback data mirrored from GitHub. Current status may be stale.", true);
}

async function FetchAndRender() {
    try {
        const Response = await fetch(BackendBaseUrl + "/api/status", {
            cache: "no-store",
            headers: { "ngrok-skip-browser-warning": "true", "Accept": "application/json" }
        });

        const RawText = await Response.text();
        if (!Response.ok) throw new Error("BadStatus:" + Response.status);

        const Data = SafeJsonParse(RawText);
        if (!Data) throw new Error("NonJsonResponse");
        _UsingFallbackHistory = false;

        const Nodes     = Data.Nodes || [];
        const Container = document.getElementById("NodeList");
        for (const Node of Nodes) BuildOrUpdateRow(Node, Container);

        const NowUnix           = Math.floor(Date.now() / 1000);
        const GeneratedAtUnix   = Number(Data.GeneratedAtUnix   || 0);
        const LastAliveUnix     = Number(Data.LastAliveUnix     || 0);
        const StaleAfterSeconds = Number(Data.StaleAfterSeconds || 30);
        const HeartbeatAge      = LastAliveUnix > 0 ? NowUnix - LastAliveUnix : Infinity;

        if (HeartbeatAge > StaleAfterSeconds) {
            SetLastUpdated("Backend heartbeat stale — polling loop may be dead");
            for (const Card of Container.querySelectorAll(".Row")) {
                const H = Card.querySelector(".RowHeader");
                if (H) {
                    H.querySelectorAll(".Dot").forEach(d => { d.className = "Dot dot-unknown"; });
                    const P = H.querySelector(".UptimePct");
                    if (P) P.className = "UptimePct status-unknown";
                }
            }
            SetBanner("⚠ Backend Dead", "Heartbeat stopped " + Math.round(HeartbeatAge) + "s ago. Polling loop may have crashed.", true);
            return;
        }

        SetLastUpdated(GeneratedAtUnix > 0
            ? "Last updated " + new Date(GeneratedAtUnix * 1000).toLocaleString()
            : "Last updated just now");

        const AnyDown     = Nodes.some(n => !n.IsUp && !n.IsUnknown && !n.IsBackend);
        const AnyDegraded = Nodes.some(n =>  n.IsUnknown && !n.IsBackend);

        if (AnyDown)     SetBanner("⚠ Degraded Service", "One or more nodes are reporting outages.", true);
        else if (AnyDegraded) SetBanner("? Status Unknown", "Some node statuses could not be verified.", true);
        else             SetBanner("", "", false);

    } catch (Err) {
        console.log("FetchAndRender Error:", Err);
        try {
            await FetchFallbackHistory();
        } catch (FallbackErr) {
            console.warn("Fallback history fetch failed:", FallbackErr);
            SetLastUpdated("Backend unreachable");
            const Container = document.getElementById("NodeList");
            if (Container.querySelectorAll(".Row").length === 0)
                {
                    const ErrorMessage = document.createElement("div");
                    ErrorMessage.className = "ErrorMsg";
                    ErrorMessage.textContent = "Unable to reach backend. Status unavailable.";
                    Container.replaceChildren(ErrorMessage);
                }
            SetBanner("⚠ Status Unknown", "Backend cannot be queried and mirrored history is unavailable.", true);
        }
    }
}

document.addEventListener("click", function(e) {
    if (_OpenPanel && !e.target.closest(".Row")) CloseDayPanel();
});

function StartPolling() {
    FetchAndRender();
    setInterval(FetchAndRender, PollIntervalMs);
}

StartPolling();
