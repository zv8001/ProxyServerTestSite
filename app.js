const BackendBaseUrl = "https://sandiest-disillusive-kymberly.ngrok-free.app";
const PollIntervalMs = 5000;

function SetCardState(CardId, BadgeId, StatusText, StateClass) {
	const Card = document.getElementById(CardId);
	const Badge = document.getElementById(BadgeId);

	Card.classList.remove("StateUp", "StateDown", "StateUnknown");
	Card.classList.add(StateClass);
	Badge.textContent = StatusText;
}

function SetBanner(TitleText, BodyText, IsVisible) {
	const Banner = document.getElementById("Banner");
	const BannerTitle = document.getElementById("BannerTitle");
	const BannerText = document.getElementById("BannerText");

	if (!IsVisible) {
		Banner.style.display = "none";
		return;
	}

	BannerTitle.textContent = TitleText;
	BannerText.textContent = BodyText;
	Banner.style.display = "block";
}

function SetLastUpdated(Text) {
	const LastUpdated = document.getElementById("LastUpdated");
	LastUpdated.textContent = Text;
}

function ApplyNodeDetails(NodeKey, HintText, DetailText) {
	const Hint = document.getElementById("Hint" + NodeKey);
	const Detail = document.getElementById("Detail" + NodeKey);
	Hint.textContent = HintText;
	Detail.textContent = DetailText;
}

function ApplyBackendDetail(Text) {
	const Detail = document.getElementById("DetailNode3");
	Detail.textContent = Text;
}

function GetStateClass(IsUp, IsUnknown) {
	if (IsUnknown) return "StateUnknown";
	return IsUp ? "StateUp" : "StateDown";
}

function GetStatusText(IsUp, IsUnknown) {
	if (IsUnknown) return "Unknown";
	return IsUp ? "Up" : "Down";
}

function SafeJsonParse(Text) {
	try {
		return JSON.parse(Text);
	} catch {
		return null;
	}
}

async function FetchAndRender() {
	try {
		const Response = await fetch(BackendBaseUrl + "/api/status", {
			cache: "no-store",
			headers: {
				"ngrok-skip-browser-warning": "true",
				"Accept": "application/json"
			}
		});

		const RawText = await Response.text();
		if (!Response.ok) {
			throw new Error("BadStatus:" + Response.status + " Body:" + RawText.slice(0, 200));
		}

		const Data = SafeJsonParse(RawText);
		if (!Data) {
			throw new Error("NonJsonResponse:" + RawText.slice(0, 200));
		}

		SetCardState("CardNode3", "BadgeNode3", "Up", "StateUp");
		ApplyBackendDetail("Backend reachable. Polling Node 1 and Node 2 from Node 3.");

		const GeneratedAtUnix = Number(Data.GeneratedAtUnix || 0);
		if (GeneratedAtUnix > 0) {
			const Dt = new Date(GeneratedAtUnix * 1000);
			SetLastUpdated("Last Updated: " + Dt.toLocaleString());
		} else {
			SetLastUpdated("Last Updated: Now");
		}

		let AnyDown = false;

		for (const Node of (Data.Nodes || [])) {
			if (!Node || !Node.Name) continue;

			let NodeKey = "";
			if (Node.Name.includes("#1")) NodeKey = "Node1";
			if (Node.Name.includes("#2")) NodeKey = "Node2";
			if (!NodeKey) continue;

			const IsUp = Boolean(Node.IsUp);
			const IsUnknown = Boolean(Node.IsUnknown);

			const StateClass = GetStateClass(IsUp, IsUnknown);
			const StatusText = GetStatusText(IsUp, IsUnknown);

			SetCardState("Card" + NodeKey, "Badge" + NodeKey, StatusText, StateClass);

			if (IsUnknown) {
				ApplyNodeDetails(NodeKey, "Status unknown", "Backend did not provide a verified state.");
			} else if (IsUp) {
				ApplyNodeDetails(NodeKey, "Online", "Node responded to health check.");
			} else {
				ApplyNodeDetails(NodeKey, "Offline", "Node did not respond to health check.");
				AnyDown = true;
			}
		}

		if (AnyDown) {
			SetBanner("Degraded", "One or more nodes are down.", true);
		} else {
			SetBanner("", "", false);
		}
	} catch (Error) {
		console.log("FetchAndRender Error:", Error);

		SetCardState("CardNode3", "BadgeNode3", "Down", "StateDown");

		const IsLikelyCors = typeof Error === "object" && Error && String(Error).toLowerCase().includes("failed to fetch");
		if (IsLikelyCors) {
			ApplyBackendDetail("Fetch blocked by the browser (likely CORS). Backend may be up, but the page cannot read it.");
		} else {
			ApplyBackendDetail("Backend unreachable. Assuming Node 1 and Node 2 are down, but their status cannot be verified.");
		}

		SetCardState("CardNode1", "BadgeNode1", "Unknown", "StateUnknown");
		SetCardState("CardNode2", "BadgeNode2", "Unknown", "StateUnknown");

		ApplyNodeDetails("Node1", "Assumed down", "Node 3 is down or unreachable from this page, status cannot be verified.");
		ApplyNodeDetails("Node2", "Assumed down", "Node 3 is down or unreachable from this page, status cannot be verified.");

		SetLastUpdated("Last Updated: Backend unreachable");

		SetBanner(
			"Status Unknown",
			"Node 3 cannot be queried from this page. Node 1 and Node 2 are assumed down, but the true status is unknown.",
			true
		);
	}
}

function StartPolling() {
	FetchAndRender();
	setInterval(FetchAndRender, PollIntervalMs);
}

StartPolling();
