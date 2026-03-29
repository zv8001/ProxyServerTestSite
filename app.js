const BackendBaseUrl = "https://api.unknown-technologies.us/status_api";
const PollIntervalMs = 5000;

function NodeSlug(Name) {
    return Name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function SetBanner(TitleText, BodyText, IsVisible) {
    const Banner    = document.getElementById("Banner");
    const BannerTitle = document.getElementById("BannerTitle");
    const BannerText  = document.getElementById("BannerText");
    if (!IsVisible) { Banner.style.display = "none"; return; }
    BannerTitle.textContent = TitleText;
    BannerText.textContent  = BodyText;
    Banner.style.display = "flex";
}

function SetLastUpdated(Text) {
    document.getElementById("LastUpdated").textContent = Text;
}

function SafeJsonParse(Text) {
    try { return JSON.parse(Text); } catch { return null; }
}

function GetBarColor(State) {
    switch (State) {
        case "up":       return "var(--Up)";
        case "degraded": return "var(--Degraded)";
        case "down":     return "var(--Down)";
        default:         return "var(--NoData)";
    }
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
    Panel.innerHTML = '<div class="DayPanelLoading">Loading ' + Date + '…</div>';

    const BarWrap = RowEl.querySelector(".BarWrap");
    BarWrap.insertAdjacentElement("afterend", Panel);

    // Animate open
    requestAnimationFrame(() => requestAnimationFrame(() => Panel.classList.add("DayPanelOpen")));

    try {
        const Res = await fetch(BackendBaseUrl + "/api/day/" + NodeSlug + "/" + Date, {
            cache: "no-store",
            headers: { "Accept": "application/json", "ngrok-skip-browser-warning": "true" }
        });
        const Data = SafeJsonParse(await Res.text());
        if (!Data || !Res.ok) throw new Error("Bad response");
        RenderDayPanel(Panel, Data, Date);
    } catch (Err) {
        console.warn("Day detail fetch failed:", Err);
        Panel.innerHTML = '<div class="DayPanelError">Failed to load detail for ' + Date + '</div>';
    }
}

function RenderDayPanel(Panel, Data, Date) {
    const RawPct   = Data.UptimePct;
    const PctClass = (RawPct == null) ? "pct-warn" : RawPct >= 99 ? "pct-good" : RawPct >= 80 ? "pct-warn" : "pct-bad";
    const StateIcon = Data.State === "up" ? "▲" : Data.State === "down" ? "▼" : "●";
    const IconClass = Data.State === "up" ? "pct-good" : Data.State === "down" ? "pct-bad" : "pct-warn";

    const Html =
        '<div class="DayPanelHeader">' +
            '<span class="DayPanelDate">' + Date + '</span>' +
            '<span class="DayPanelStat">' + Data.TotalChecks + ' checks</span>' +
            '<span class="DayPanelStat DayPanelUptimePct ' + PctClass + '">' +
                (RawPct != null ? RawPct.toFixed(2) + "% uptime" : "No data") +
            '</span>' +
            '<button class="DayPanelClose" onclick="CloseDayPanel()">✕</button>' +
        '</div>' +
        '<div class="DaySummaryBody">' +
            '<span class="DaySummaryIcon ' + IconClass + '">' + StateIcon + '</span>' +
            '<span class="DaySummaryText">' + (Data.Summary || "No data recorded for this day.") + '</span>' +
        '</div>';

    Panel.innerHTML = Html;
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
        Labels.innerHTML = '<span>‹ 90 DAYS AGO</span><span>TODAY</span>';
        Row.appendChild(Labels);
        const Sep = document.createElement("div"); Sep.className = "RowSep"; Row.appendChild(Sep);

        Container.appendChild(Row);
    }

    // ── Update header ──
    const Header = Row.querySelector(".RowHeader");
    Header.innerHTML =
        '<div class="RowLeft">' +
            '<span class="Dot ' + DotClass + '"></span>' +
            '<span class="NodeName">' + Node.Name + '</span>' +
            (Node.Description ? '<span class="NodeDesc">' + Node.Description + '</span>' : '') +
        '</div>' +
        '<div class="UptimePct ' + StatusClass + '">' + UptimeText + '</div>';

    // ── Rebuild bars (but keep any open DayPanel in place) ──
    const BarWrap = Row.querySelector(".BarWrap");
    BarWrap.innerHTML = "";

    const History = Node.History || [];
    for (const Entry of History) {
        const Bar = document.createElement("div");
        Bar.className = "Bar";
        Bar.style.background = GetBarColor(Entry.state);

        const StateLabel = { up: "Operational", degraded: "Degraded", down: "Outage", nodata: "No data" }[Entry.state] || "Unknown";
        const Clickable  = Entry.state !== "nodata";

        Bar.title = Entry.date + "  •  " + StateLabel + (Clickable ? "  —  click for details" : "");

        if (Clickable) {
            Bar.style.cursor = "pointer";
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
        SetLastUpdated("Backend unreachable");
        const Container = document.getElementById("NodeList");
        if (Container.querySelectorAll(".Row").length === 0)
            Container.innerHTML = '<div class="ErrorMsg">Unable to reach backend. Status unavailable.</div>';
        SetBanner("⚠ Status Unknown", "Backend cannot be queried. All node statuses are unknown.", true);
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
