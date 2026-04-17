export function LogicBoard() {
  return (
    <div className="relative aspect-square lg:aspect-auto lg:h-[600px] border border-white/10 bg-carbon-900 glow-electric-soft rounded-xl overflow-hidden panel-shadow">
      <div className="absolute inset-0 grid-pattern-dense opacity-30" />

      {/* Status bar */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center text-[10px] font-mono tracking-tight text-muted-foreground">
        <span>SYSTEM_VERSION: 4.0.2</span>
        <div className="flex items-center gap-4">
          <span>NODES: 12/12</span>
          <span className="text-electric">ENCRYPTED_LINK</span>
        </div>
      </div>

      {/* Scan line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-electric/20 to-transparent animate-scan-line" />

      <div className="absolute inset-0 flex items-center justify-center p-12">
        <div className="relative size-full border border-white/5 rounded-lg">
          {/* Node 1 */}
          <div className="absolute top-[18%] left-[8%] p-4 border border-electric/30 bg-carbon-950 rounded shadow-[0_0_20px_rgba(0,242,255,0.05)]">
            <div className="text-[9px] font-mono text-electric mb-2 tracking-tight">
              NODE_01: INGEST
            </div>
            <div className="h-1 w-24 bg-electric/20 rounded-full overflow-hidden">
              <div className="h-full w-2/3 bg-electric" />
            </div>
          </div>

          {/* Core processor */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-6 border border-white/10 bg-carbon-950 rounded-lg shadow-2xl">
            <div className="text-[10px] font-mono text-muted-foreground mb-3">
              CORE_PROCESSOR_7
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                "bg-electric/40",
                "bg-electric",
                "bg-white/10",
                "bg-electric/60",
                "bg-electric",
                "bg-electric/20",
                "bg-white/20",
                "bg-electric/80",
              ].map((c, i) => (
                <div key={i} className={`size-4 ${c} rounded-sm`} />
              ))}
            </div>
          </div>

          {/* Output relay */}
          <div className="absolute bottom-[14%] right-[10%] p-4 border border-white/10 bg-carbon-950 rounded">
            <div className="text-[9px] font-mono text-muted-foreground mb-2">
              OUTPUT_RELAY
            </div>
            <div className="flex gap-1">
              <div
                className="size-1.5 rounded-full bg-electric"
                style={{ animation: "pulse-dot 1.4s infinite" }}
              />
              <div
                className="size-1.5 rounded-full bg-electric"
                style={{ animation: "pulse-dot 1.4s infinite 0.2s" }}
              />
              <div className="size-1.5 rounded-full bg-carbon-800" />
            </div>
          </div>

          {/* Connection lines */}
          <div className="absolute top-[28%] left-[22%] w-32 h-px bg-gradient-to-r from-electric/50 to-transparent" />
          <div className="absolute bottom-[32%] right-[28%] w-32 h-px bg-gradient-to-l from-electric/50 to-transparent" />
          <div className="absolute top-[40%] right-[28%] w-px h-24 bg-gradient-to-b from-white/20 to-transparent" />
        </div>
      </div>

      {/* Floating telemetry */}
      <div className="absolute bottom-8 left-8 right-8 flex justify-between">
        <div className="bg-carbon-950 border border-white/10 p-3 rounded-md">
          <div className="text-[8px] uppercase tracking-widest text-muted-foreground mb-1">
            Operational Load
          </div>
          <div className="text-sm font-mono text-foreground">32.41 T/ops</div>
        </div>
        <div className="bg-carbon-950 border border-white/10 p-3 rounded-md">
          <div className="text-[8px] uppercase tracking-widest text-muted-foreground mb-1">
            Thermal Index
          </div>
          <div className="text-sm font-mono text-electric">OPTIMAL</div>
        </div>
      </div>
    </div>
  );
}
