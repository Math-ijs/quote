(() => {
  "use strict";

  const data = window.VERMOGEN_DATA;
  const $ = (id) => document.getElementById(id);
  const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const integer = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });
  const numberIds = ["homeValue", "mortgage", "savings", "investments", "otherAssets", "cars", "personalItems", "debts"];
  let hasHome = true;
  let chart = null;

  if (!data || !data.kern || !data.percentielen || !data.klassen) {
    document.body.innerHTML = '<main style="padding:40px;color:white;font-family:Arial"><h1>Data niet geladen</h1><p>Controleer of data.js naast index.html staat en correct is geüpload.</p></main>';
    return;
  }

  function safeAmount(id) {
    const value = Number($(id).value);
    return Number.isFinite(value) && value > 0 ? Math.min(value, data.rekenen.maxBedrag) : 0;
  }

  function amounts() {
    return Object.fromEntries(numberIds.map(id => [id, safeAmount(id)]));
  }

  function totals() {
    const a = amounts();
    if (!hasHome) { a.homeValue = 0; a.mortgage = 0; }
    const cbsAssets = a.homeValue + a.savings + a.investments + a.otherAssets;
    const cbsDebts = a.mortgage + a.debts;
    const cbsNet = cbsAssets - cbsDebts;
    const personalNet = cbsNet + a.cars + a.personalItems;
    return { ...a, cbsAssets, cbsDebts, cbsNet, personalNet };
  }

  function updateLiveTotal() {
    $("liveTotal").textContent = euro.format(totals().personalNet);
  }

  // Maak CDF-ankers uit CBS-klassen, percentielen en de apart geschatte bovenstaart.
  // CDF = geschat aantal huishoudens met minder vermogen dan het ingevoerde bedrag.
  function buildAnchors() {
    const n = data.kern.huishoudens;
    const anchors = [];
    const add = (x, cdf, source) => {
      if (Number.isFinite(x) && Number.isFinite(cdf)) anchors.push({ x, cdf: Math.max(0, Math.min(n, cdf)), source });
    };

    const first = data.klassen[0];
    const bottomMedian = first.mediaan ?? -24700;
    add(data.onderstaart?.vermogenNul ?? -250000, 0, "aanname ondergrens");
    add(bottomMedian, first.aantal / 2, "mediaan laagste klasse");
    let cumulative = first.aantal;
    add(first.tot, cumulative, "CBS-klassegrens");

    for (let i = 1; i < data.klassen.length; i++) {
      const cls = data.klassen[i];
      cumulative += cls.aantal;
      add(cls.tot, cumulative, "CBS-klassegrens");
    }

    for (const p of data.percentielen) add(p.vermogen, n * p.p / 100, "CBS-percentiel");

    // De grens van €1 miljoen is rechtstreeks af te leiden uit het aantal miljonairshuishoudens.
    const tail = data.staart.ankers;
    for (const point of tail) add(point.vermogen, n - point.boven, "CBS / afgeleide staart");

    anchors.sort((a, b) => a.x - b.x);
    const clean = [];
    for (const point of anchors) {
      const last = clean[clean.length - 1];
      if (last && Math.abs(last.x - point.x) < 0.0001) {
        // Bij gelijke vermogensgrens wint de expliciete percentielwaarde.
        if (point.source === "CBS-percentiel") last.cdf = point.cdf;
        else last.cdf = Math.max(last.cdf, point.cdf);
      } else clean.push({ ...point });
    }
    // Houd CDF monotone bij eventuele afrondingsverschillen in CBS-tabellen.
    for (let i = 1; i < clean.length; i++) clean[i].cdf = Math.max(clean[i].cdf, clean[i - 1].cdf);
    return clean;
  }

  const anchors = buildAnchors();

  function interpolateLinear(x, a, b) {
    if (b.x === a.x) return a.cdf;
    const t = (x - a.x) / (b.x - a.x);
    return a.cdf + t * (b.cdf - a.cdf);
  }

  function interpolateLogTail(x, a, b) {
    const lx = Math.log(x), la = Math.log(a.x), lb = Math.log(b.x);
    const t = (lx - la) / (lb - la);
    const logA = Math.log(Math.max(1, a.above));
    const logB = Math.log(Math.max(1, b.above));
    const above = Math.exp(logA + t * (logB - logA));
    return data.kern.huishoudens - above;
  }

  function estimateCdf(wealth) {
    const n = data.kern.huishoudens;
    const tail = data.staart.ankers;
    const oneMillion = tail[0];
    const lastPercentile = data.percentielen[data.percentielen.length - 1];
    if (wealth >= oneMillion.vermogen) {
      if (wealth >= tail[tail.length - 1].vermogen) {
        const last = tail[tail.length - 1];
        const above = last.boven * Math.pow(wealth / last.vermogen, -data.staart.alfaBoven);
        return n - above;
      }
      for (let i = 0; i < tail.length - 1; i++) {
        if (wealth >= tail[i].vermogen && wealth <= tail[i + 1].vermogen) {
          return interpolateLogTail(wealth,
            { x: tail[i].vermogen, above: tail[i].boven },
            { x: tail[i + 1].vermogen, above: tail[i + 1].boven });
        }
      }
    }

    if (wealth > lastPercentile.vermogen && wealth < oneMillion.vermogen) {
      const a = { x: lastPercentile.vermogen, above: n * (1 - lastPercentile.p / 100) };
      const b = { x: oneMillion.vermogen, above: oneMillion.boven };
      return interpolateLogTail(wealth, a, b);
    }

    if (wealth <= anchors[0].x) return 0;
    if (wealth >= anchors[anchors.length - 1].x) return n;
    for (let i = 0; i < anchors.length - 1; i++) {
      if (wealth >= anchors[i].x && wealth <= anchors[i + 1].x) {
        return interpolateLinear(wealth, anchors[i], anchors[i + 1]);
      }
    }
    return n / 2;
  }

  function estimatePosition(wealth) {
    const n = data.kern.huishoudens;
    const cdf = Math.max(0, Math.min(n, estimateCdf(wealth)));
    const above = Math.max(0, Math.min(n, n - cdf));
    const rank = Math.max(1, Math.min(n, Math.round(above) + 1));
    const percentile = Math.max(0, Math.min(100, (cdf / n) * 100));
    return { rank, above: Math.round(above), percentile, topPercent: 100 - percentile };
  }

  function wealthAtPercentile(p) {
    const points = data.percentielen;
    if (p <= 90) {
      const exact = points.find(item => item.p === p);
      if (exact) return exact.vermogen;
      const lower = [...points].reverse().find(item => item.p < p);
      const upper = points.find(item => item.p > p);
      return lower && upper
        ? lower.vermogen + (upper.vermogen - lower.vermogen) * ((p - lower.p) / (upper.p - lower.p))
        : 0;
    }

    // Boven p90 wordt dezelfde log-log staart gebruikt als bij de rangschikking.
    const targetAbove = data.kern.huishoudens * (1 - p / 100);
    const tail = data.staart.ankers;
    for (let i = 0; i < tail.length - 1; i++) {
      const a = tail[i], b = tail[i + 1];
      if (targetAbove <= a.boven && targetAbove >= b.boven) {
        const t = (Math.log(targetAbove) - Math.log(a.boven)) /
                  (Math.log(b.boven) - Math.log(a.boven));
        return Math.exp(Math.log(a.vermogen) + t * (Math.log(b.vermogen) - Math.log(a.vermogen)));
      }
    }
    const last = tail[tail.length - 1];
    return last.vermogen * Math.pow(last.boven / targetAbove, 1 / data.staart.alfaBoven);
  }

  function renderBenchmarks() {
    const chosen = [25, 50, 75, 90, 95, 99];
    $("benchmarkList").innerHTML = chosen.map(p =>
      `<div class="benchmark"><span>${p}e percentiel</span><strong>${euro.format(wealthAtPercentile(p))}</strong></div>`
    ).join("");
  }

  function renderChart(a) {
    const canvas = $("assetsChart");
    const values = [
      Math.max(0, a.homeValue - a.mortgage),
      a.savings,
      a.investments,
      a.otherAssets,
      a.cars,
      a.personalItems
    ];
    const labels = ["Woningvermogen", "Spaargeld", "Beleggingen", "Overige CBS-bezittingen", "Auto's", "Overige spullen"];
    const colors = ["#72d6a1", "#8bb8ff", "#b49aff", "#e5bd78", "#e28c83", "#8293a9"];
    const total = values.reduce((sum, value) => sum + value, 0);
    const displayValues = total > 0 ? values : [1, 0, 0, 0, 0, 0];
    if (chart) chart.destroy();
    chart = new Chart(canvas, {
      type: "doughnut",
      data: { labels, datasets: [{ data: displayValues, backgroundColor: colors, borderColor: "#17283e", borderWidth: 4, hoverOffset: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "69%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${euro.format(total > 0 ? ctx.raw : 0)}` } } } }
    });
    $("chartLegend").innerHTML = labels.map((label, i) => `<div class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span><span>${label}</span><strong>${euro.format(values[i])}</strong></div>`).join("");
  }

  function showResults() {
    const t = totals();
    const pos = estimatePosition(t.cbsNet);
    const n = data.kern.huishoudens;
    $("rankNumber").textContent = "#" + integer.format(pos.rank);
    $("rankTotal").textContent = integer.format(n);
    $("rankPercentile").textContent = `Je hebt naar schatting meer vermogen dan ${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(pos.percentile)}% van de huishoudens.`;
    $("topPercent").textContent = `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(pos.topPercent)}%`;
    $("resultNet").textContent = euro.format(t.personalNet);
    $("resultComparable").textContent = euro.format(t.cbsNet);
    $("resultAbove").textContent = integer.format(pos.above);
    $("percentileFill").style.width = `${pos.percentile}%`;
    $("percentileMarker").style.left = `${pos.percentile}%`;
    $("percentileExplanation").textContent = `Met ${euro.format(t.cbsNet)} vergelijkingsvermogen zit je naar schatting op het ${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(pos.percentile)}e percentiel.`;
    renderBenchmarks();
    renderChart(t);
    $("methodText").textContent = `De schatting gebruikt voorlopige CBS-cijfers over 1 januari ${data.meta.meetjaar}. Binnen vermogensklassen wordt lineair geïnterpoleerd. Boven € 1 miljoen wordt een Pareto-achtige staart gebruikt op basis van CBS-ankers; boven € 10 miljoen is de uitkomst extra onzeker. Auto's en gewone spullen voor eigen gebruik zijn wel in jouw eigen totaal opgenomen, maar niet in de CBS-vergelijkingswaarde.`;
    $("sourceLine").innerHTML = `Bronnen: <a href="https://www.cbs.nl/nl-nl/cijfers/detail/83835NED" target="_blank" rel="noopener">CBS vermogensklassen</a> · <a href="https://www.cbs.nl/nl-nl/cijfers/detail/83934NED" target="_blank" rel="noopener">CBS percentielen</a> · meetjaar ${data.meta.meetjaar} (${data.meta.status}).`;
    $("results").hidden = false;
    $("results").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function validate() {
    return numberIds.every(id => {
      const raw = $(id).value.trim();
      if (!raw) return true;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 && value <= data.rekenen.maxBedrag;
    });
  }

  numberIds.forEach(id => $(id).addEventListener("input", updateLiveTotal));

  document.querySelectorAll("[data-home]").forEach(button => {
    button.addEventListener("click", () => {
      hasHome = button.dataset.home === "yes";
      document.querySelectorAll("[data-home]").forEach(item => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      $("homeFields").hidden = !hasHome;
      updateLiveTotal();
    });
  });

  $("wealthForm").addEventListener("submit", event => {
    event.preventDefault();
    $("formError").hidden = validate();
    if (!validate()) return;
    showResults();
  });

  $("editButton").addEventListener("click", () => {
    $("calculator").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("printButton").addEventListener("click", () => window.print());
  $("resetButton").addEventListener("click", () => {
    numberIds.forEach(id => { $(id).value = ""; });
    hasHome = true;
    $("homeFields").hidden = false;
    document.querySelectorAll("[data-home]").forEach(item => {
      const active = item.dataset.home === "yes";
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    $("results").hidden = true;
    $("formError").hidden = true;
    updateLiveTotal();
    $("calculator").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("householdsStat").textContent = `${(data.kern.huishoudens / 1000000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} miljoen`;
  $("medianStat").textContent = euro.format(data.kern.mediaan);
  $("millionaireStat").textContent = `${String(data.kern.miljonairsAandeelPct).replace(".", ",")}%`;
  $("rankTotal").textContent = integer.format(data.kern.huishoudens);
  updateLiveTotal();
})(); 
