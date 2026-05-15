const flow = ["Input(File)", "Parser", "Standard JSON", "Conflict Check", "Database"];

export default function Home() {
  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "64px 24px" }}>
      <p style={{ letterSpacing: 2, textTransform: "uppercase", color: "var(--brand)", fontWeight: 700 }}>
        BabelTower mainline baseline
      </p>
      <h1 style={{ fontSize: "clamp(42px, 8vw, 86px)", lineHeight: 0.92, margin: "16px 0" }}>
        中文基准的 i18n 字典收口台
      </h1>
      <p style={{ maxWidth: 760, fontSize: 20, color: "var(--muted)", lineHeight: 1.7 }}>
        主线已收拢规划文档、Standard JSON 核心引擎、API Route 骨架、Pencil/HTML UI 资产、QA 用例与部署配置。下一步前后端按同一主线目录继续集成。
      </p>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 36 }}>
        {flow.map((item, index) => (
          <div key={item} style={{ padding: 20, border: "1px solid var(--line)", borderRadius: 18, background: "var(--card)" }}>
            <strong style={{ color: "var(--brand)" }}>{String(index + 1).padStart(2, "0")}</strong>
            <div style={{ marginTop: 16, fontSize: 18 }}>{item}</div>
          </div>
        ))}
      </section>
      <section style={{ marginTop: 42, padding: 24, borderRadius: 24, border: "1px solid var(--line)", background: "var(--card)" }}>
        <h2 style={{ marginTop: 0 }}>Integrated assets</h2>
        <ul style={{ lineHeight: 1.9 }}>
          <li>API contract: <code>openapi/babeltower.v1.yaml</code></li>
          <li>Database schema: <code>prisma/schema.prisma</code></li>
          <li>Core engine: <code>src/domain</code></li>
          <li>UI prototype: <code>ui-design/prototypes/all-pages.html</code> and <code>ui-design/pencil/*.pen</code></li>
          <li>QA suites: <code>tests/</code></li>
        </ul>
      </section>
    </main>
  );
}
