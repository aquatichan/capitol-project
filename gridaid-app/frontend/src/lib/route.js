import { useEffect, useState } from "react";

// Two pages share one planner state; the page is a key in the hash (#c=48201&p=logistics) so links and the
// browser's back button work without a server route.
const read = () => new URLSearchParams(window.location.hash.replace(/^#/, "")).get("p") === "logistics" ? "logistics" : "planner";

export function usePage() {
  const [page, setPage] = useState(read);
  useEffect(() => {
    const on = () => setPage(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return page;
}

export function goTo(page) {
  const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (page === "logistics") p.set("p", "logistics");
  else p.delete("p");
  window.location.hash = p.toString();          // a real history entry, so Back returns to the other page
  window.scrollTo(0, 0);
}
