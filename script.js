(() => {
    "use strict";

    const $ = (selector) => document.querySelector(selector);
    const sourceSelect = $("#source");
    const destinationSelect = $("#destination");
    const graph = $("#campusGraph");
    const form = $("#navigationForm");
    const findButton = $("#findRoute");
    const message = $("#formMessage");

    const nodes = [
        { id: "MG", name: "Main Gate", x: 92, y: 240 },
        { id: "AB", name: "Admin Block", x: 230, y: 240 },
        { id: "CL", name: "Central Library", x: 365, y: 105 },
        { id: "CS", name: "CSE Block", x: 390, y: 300 },
        { id: "ME", name: "Mechanical Block", x: 535, y: 190 },
        { id: "AUD", name: "Auditorium", x: 525, y: 65 },
        { id: "CAF", name: "Student Cafeteria", x: 585, y: 350 },
        { id: "SP", name: "Sports Complex", x: 700, y: 205 },
        { id: "BH", name: "Boys Hostel", x: 700, y: 415 },
        { id: "GH", name: "Girls Hostel", x: 275, y: 405 }
    ];

    // Distances match the seeded database records in app.py.
    const edges = [
        ["MG", "AB", 150], ["AB", "CL", 180], ["AB", "CS", 200],
        ["CS", "GH", 220], ["CS", "ME", 160], ["CS", "CAF", 210],
        ["CL", "ME", 190], ["CL", "AUD", 250], ["ME", "CAF", 170],
        ["ME", "AUD", 210], ["CAF", "BH", 280], ["AUD", "SP", 230],
        ["ME", "SP", 310], ["BH", "SP", 190]
    ];

    let currentRoute = [];
    let currentSource = sourceSelect.value;
    let currentDestination = destinationSelect.value;

    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);

    function drawGraph() {
        const nodeById = Object.fromEntries(nodes.map((node) => [node.id, node]));
        const edgeMarkup = edges.map(([from, to, distance]) => {
            const a = nodeById[from];
            const b = nodeById[to];
            const isRouteEdge = currentRoute.some((id, index) =>
                index < currentRoute.length - 1 &&
                ((id === from && currentRoute[index + 1] === to) ||
                 (id === to && currentRoute[index + 1] === from))
            );
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            return `
                <g>
                    <line class="edge ${isRouteEdge ? "route-edge" : ""}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>
                    <rect class="edge-label-bg" x="${midX - 19}" y="${midY - 9}" width="38" height="18" rx="6"></rect>
                    <text class="edge-label" x="${midX}" y="${midY + 4}">${distance}m</text>
                </g>`;
        }).join("");

        const nodeMarkup = nodes.map((node) => {
            const classes = [
                "graph-node",
                node.id === currentSource ? "source" : "",
                node.id === currentDestination ? "goal" : "",
                currentRoute.includes(node.id) ? "on-path" : ""
            ].filter(Boolean).join(" ");
            const labelY = node.y + 37;
            return `
                <g class="${classes}" data-node="${node.id}" role="button" tabindex="0"
                   aria-label="Set ${escapeHtml(node.name)} as destination">
                    <circle class="node-halo" cx="${node.x}" cy="${node.y}" r="30"></circle>
                    <circle class="node-circle" cx="${node.x}" cy="${node.y}" r="21"></circle>
                    <text class="node-id" x="${node.x}" y="${node.y + 4}">${node.id}</text>
                    <text class="node-label" x="${node.x}" y="${labelY}">${escapeHtml(node.name)}</text>
                </g>`;
        }).join("");

        graph.innerHTML = `<g>${edgeMarkup}</g><g>${nodeMarkup}</g>`;
        graph.querySelectorAll("[data-node]").forEach((element) => {
            const chooseNode = () => {
                const code = element.dataset.node;
                if (code === currentSource) {
                    setMessage("That is already your starting point. Choose another destination.", "");
                    return;
                }
                destinationSelect.value = code;
                currentDestination = code;
                drawGraph();
                setMessage(`${nodeById[code].name} selected as your destination.`, "");
            };
            element.addEventListener("click", chooseNode);
            element.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    chooseNode();
                }
            });
        });
    }

    function setMessage(text, type) {
        message.textContent = text;
        message.className = `form-message ${type || ""}`.trim();
    }

    function setAgentStatus(text, busy = false) {
        $("#agentStatus").classList.toggle("busy", busy);
        $("#agentStatus").innerHTML = `<span></span> ${escapeHtml(text)}`;
    }

    function resetResults() {
        currentRoute = [];
        $("#distanceMetric").innerHTML = '-- <em>m</em>';
        $("#timeMetric").innerHTML = '-- <em>min</em>';
        $("#hopsMetric").textContent = "--";
        $("#nodesMetric").textContent = "--";
        $("#routeLabel").textContent = "AWAITING ROUTE";
        $("#routeSummary").textContent = "No route calculated yet";
        $("#goalTest").textContent = "Waiting for search";
        $("#visitedNodes").innerHTML = '<span class="empty-chip">Your search will appear here</span>';
        $("#exploredCount").textContent = "0 locations";
        $("#directions").innerHTML = `
            <div class="empty-directions">
                <span><i data-lucide="signpost"></i></span>
                <strong>Your route will appear here</strong>
                <p>Choose two locations and let CampusFlow find your way.</p>
            </div>`;
        setAgentStatus("IDLE");
        drawGraph();
        if (window.lucide) window.lucide.createIcons();
    }

    function renderRoute(data) {
        currentRoute = data.path || [];
        $("#distanceMetric").innerHTML = `${data.distance} <em>m</em>`;
        $("#timeMetric").innerHTML = `${Number(data.walkingTime).toFixed(1)} <em>min</em>`;
        $("#hopsMetric").textContent = data.hops;
        $("#nodesMetric").textContent = data.visited.length;
        $("#routeLabel").textContent = data.success ? "ROUTE FOUND" : "NO ROUTE";
        $("#routeSummary").textContent = data.success
            ? `${data.pathNames[0]} → ${data.pathNames[data.pathNames.length - 1]}`
            : "No connected route";
        $("#goalTest").textContent = data.success ? "Destination reached" : "Destination unreachable";
        $("#visitedNodes").innerHTML = data.visited.length
            ? data.visited.map((code) => `<span class="node-chip ${currentRoute.includes(code) ? "route-node" : ""}">${escapeHtml(code)}</span>`).join("")
            : '<span class="empty-chip">No nodes explored</span>';
        $("#exploredCount").textContent = `${data.visited.length} location${data.visited.length === 1 ? "" : "s"}`;

        if (!data.success) {
            $("#directions").innerHTML = '<div class="empty-directions"><span><i data-lucide="map-off"></i></span><strong>No route available</strong><p>These locations are not connected in the current campus map.</p></div>';
        } else if (data.directions.length === 0) {
            $("#directions").innerHTML = '<div class="empty-directions"><span><i data-lucide="check-circle-2"></i></span><strong>You are already there!</strong><p>Your starting point and destination are the same.</p></div>';
        } else {
            $("#directions").innerHTML = data.directions.map((step) => `
                <div class="direction-row">
                    <span class="step-number">${step.step.toString().padStart(2, "0")}</span>
                    <div class="direction-copy">
                        <strong>${escapeHtml(step.fromName)} <span aria-hidden="true">→</span> ${escapeHtml(step.toName)}</strong>
                        <small>Continue to the next connected location</small>
                    </div>
                    <span class="leg-distance">${step.distance} m</span>
                </div>`).join("");
        }
        setAgentStatus(data.success ? "GOAL REACHED" : "NO ROUTE");
        drawGraph();
        if (window.lucide) window.lucide.createIcons();
    }

    async function loadHistory() {
        const historyList = $("#historyList");
        try {
            const response = await fetch("/api/history");
            if (!response.ok) throw new Error("History request failed");
            const items = await response.json();
            historyList.innerHTML = items.length ? items.slice(0, 5).map((item) => `
                <div class="history-item">
                    <span class="history-route-icon"><i data-lucide="route"></i></span>
                    <div class="history-copy">
                        <strong>${escapeHtml(item.source)} <span>→</span> ${escapeHtml(item.destination)}</strong>
                        <small>${item.distance} m · ${item.hops} connection${item.hops === 1 ? "" : "s"}</small>
                    </div>
                    <span class="history-status ${item.success ? "success" : "failed"}">${item.success ? "Saved" : "No route"}</span>
                </div>`).join("") : '<div class="history-empty">Your searches will be saved here automatically.</div>';
            $("#totalSearches").textContent = items.length;
            if (window.lucide) window.lucide.createIcons();
        } catch (error) {
            historyList.innerHTML = '<div class="history-empty">Could not load history. Please try refreshing.</div>';
        }
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const source = sourceSelect.value;
        const destination = destinationSelect.value;
        currentSource = source;
        currentDestination = destination;
        findButton.disabled = true;
        findButton.innerHTML = '<span><i data-lucide="loader-circle"></i> Finding route...</span><i data-lucide="arrow-up-right"></i>';
        if (window.lucide) window.lucide.createIcons();
        setMessage("Searching the campus graph and saving your result...", "");
        setAgentStatus("SEARCHING", true);
        drawGraph();

        try {
            const response = await fetch("/api/navigate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source, destination })
            });
            const data = await response.json();
            if (!response.ok || data.error) throw new Error(data.error || "Could not calculate the route.");
            renderRoute(data);
            setMessage(data.success ? "Route calculated and saved to navigation history." : "No connected route was found. Search result saved.", data.success ? "success" : "error");
            await loadHistory();
        } catch (error) {
            setMessage(error.message || "Something went wrong. Please try again.", "error");
            setAgentStatus("ERROR");
        } finally {
            findButton.disabled = false;
            findButton.innerHTML = '<span><i data-lucide="route"></i> Find best route</span><i data-lucide="arrow-up-right"></i>';
            if (window.lucide) window.lucide.createIcons();
        }
    });

    sourceSelect.addEventListener("change", () => {
        currentSource = sourceSelect.value;
        drawGraph();
    });
    destinationSelect.addEventListener("change", () => {
        currentDestination = destinationSelect.value;
        drawGraph();
    });

    $("#swapLocations").addEventListener("click", () => {
        const oldSource = sourceSelect.value;
        sourceSelect.value = destinationSelect.value;
        destinationSelect.value = oldSource;
        currentSource = sourceSelect.value;
        currentDestination = destinationSelect.value;
        drawGraph();
        setMessage("Starting point and destination swapped.", "");
    });

    $("#resetRoute").addEventListener("click", () => {
        sourceSelect.value = "MG";
        destinationSelect.value = "BH";
        currentSource = sourceSelect.value;
        currentDestination = destinationSelect.value;
        resetResults();
        setMessage("Route reset. Choose your locations to begin again.", "");
    });

    $("#refreshHistory").addEventListener("click", loadHistory);

    drawGraph();
    if (window.lucide) window.lucide.createIcons();
})();
