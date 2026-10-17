import { useEffect, useState } from "react";

export default function App() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/data").then((r) => r.json()).then(setData);
  }, []);

  return (
    <div>
      <h1>GridAid</h1>
      <pre>{data ? Object.keys(data.counties).join(", ") : "hello world (this did not work)"}</pre>
    </div>
  );
}
