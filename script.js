document.documentElement.classList.add("js");
const header = document.querySelector("[data-header]"),
  menu = document.querySelector("[data-menu-button]"),
  nav = document.querySelector("[data-nav]");
function closeMenu() {
  menu?.setAttribute("aria-expanded", "false");
  nav?.classList.remove("is-open");
}
menu?.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  nav?.classList.toggle("is-open", open);
});
nav?.addEventListener("click", (e) => {
  if (e.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menu?.getAttribute("aria-expanded") === "true") {
    closeMenu();
    menu.focus();
  }
});
document.addEventListener("click", (e) => {
  if (header && !header.contains(e.target)) closeMenu();
});
const updateHeader = () =>
  header?.classList.toggle("is-scrolled", window.scrollY > 10);
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });
document.querySelectorAll("[data-load-demo]").forEach((button) =>
  button.addEventListener("click", () => {
    const container = button.closest("[data-embed]");
    const frame = document.createElement("iframe");
    frame.src = container.dataset.embed;
    frame.title = "Kora interactive sample with fictional data";
    frame.sandbox = "allow-scripts allow-same-origin allow-downloads";
    container.replaceChildren(frame);
    frame.addEventListener("load", () => frame.focus(), { once: true });
  }),
);
const sample = document.querySelector("[data-ks-sample]");
if (sample) {
  const records = {
    website: {
      title: "Website refresh",
      client: "Juniper Wellness · Client delivery",
      status: "In progress",
      detail:
        "Review the homepage direction with the client, then prepare the remaining service pages.",
      draft:
        "The homepage direction is ready for your review. After feedback, the next step is to prepare the service pages and confirm the content for each.",
    },
    brand: {
      title: "Brand guidelines",
      client: "Cedar & Co. · Brand project",
      status: "Planning",
      detail:
        "Gather the client’s reference material and agree on the scope of the identity guidelines.",
      draft:
        "We are gathering references and confirming the scope of your brand guidelines. Next, we will review the direction together before developing the complete guide.",
    },
    onboarding: {
      title: "Client onboarding",
      client: "Northstar Studio · Internal work",
      status: "In review",
      detail:
        "Check that the kickoff notes and client access requirements are ready for the team.",
      draft:
        "The kickoff notes are ready for review. We are checking access requirements so the team has the context it needs to start work.",
    },
  };
  let selected = "website",
    states = {};
  const q = (s) => sample.querySelector(s);
  const state = () =>
    states[selected] ??
    (states[selected] = { done: false, draft: false, events: [] });
  function render() {
    const r = records[selected],
      s = state();
    q("[data-project-title]").textContent = r.title;
    q("[data-project-client]").textContent = r.client;
    q("[data-project-status]").textContent = r.status;
    q("[data-project-detail]").textContent = r.detail;
    q("#sample-task").checked = s.done;
    q(".sample-draft").hidden = !s.draft;
    q("[data-draft-text]").textContent = r.draft;
    q("[data-activity-empty]").hidden = s.events.length > 0;
    q("[data-activity-list]").replaceChildren(
      ...s.events.map((t) => {
        const li = document.createElement("li");
        li.textContent = t;
        return li;
      }),
    );
    sample.querySelectorAll("[data-project]").forEach((b) => {
      b.classList.toggle("active", b.dataset.project === selected);
      b.setAttribute("aria-pressed", String(b.dataset.project === selected));
    });
  }
  sample.querySelectorAll("[data-project]").forEach((b) =>
    b.addEventListener("click", () => {
      selected = b.dataset.project;
      render();
    }),
  );
  q("#project-search").addEventListener("input", (e) => {
    let matches = 0;
    sample.querySelectorAll("[data-project]").forEach((b) => {
      b.hidden = !b.textContent
        .toLowerCase()
        .includes(e.target.value.toLowerCase());
      if (!b.hidden) matches++;
    });
    q(".no-projects").hidden = matches > 0;
  });
  sample.querySelectorAll("[data-sample-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      const overview = b.dataset.sampleTab === "overview";
      q("[data-sample-overview]").hidden = !overview;
      q("[data-sample-activity]").hidden = overview;
      sample
        .querySelectorAll("[data-sample-tab]")
        .forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
    }),
  );
  q("#sample-task").addEventListener("change", (e) => {
    state().done = e.target.checked;
    state().events.push(
      e.target.checked
        ? "Marked project notes reviewed."
        : "Reopened project notes review.",
    );
    render();
  });
  q("[data-prepare-update]").addEventListener("click", () => {
    if (!state().draft)
      state().events.push("Prepared a local sample update. Nothing sent.");
    state().draft = true;
    render();
  });
  q("[data-reset-sample]").addEventListener("click", () => {
    states = {};
    selected = "website";
    q("#project-search").value = "";
    q("#project-search").dispatchEvent(new Event("input"));
    q('[data-sample-tab="overview"]').click();
    render();
  });
  render();
}
document
  .querySelectorAll("[data-year]")
  .forEach((e) => (e.textContent = new Date().getFullYear()));
