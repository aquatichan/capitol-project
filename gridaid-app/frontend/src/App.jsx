import { useEffect, useState } from "react";

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/data")
      .then((r) => {
        if (!r.ok) throw new Error(`/api/data returned ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  let text = "loading...";
  if (error) text = `error: ${error}`;
  else if (data?.counties) text = Object.keys(data.counties).join(", ");

  return (
    <div>
      <h1>GridAid</h1>
      <pre>{text}</pre>
    </div>
  );
}
