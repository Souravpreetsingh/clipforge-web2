"use client";

export const TopBar = () => {
  return (
    <section
      className="w-full bg-surface-container-low px-space-md py-space-xs rounded-t-xl flex flex-wrap items-center justify-between gap-space-md shadow-sm"
    >
      {/* Left: Clip Title & History Actions */}
      <div className="flex items-center gap-space-md min-w-0">
        <div className="flex items-center gap-1.5 bg-surface-container px-space-sm py-1 rounded">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          <span className="font-mono-code text-mono-code text-on-surface-variant font-medium">LIVE SESSION</span>
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-space-xs">
            <h1
              className="font-headline-sm text-headline-sm text-on-surface truncate"
            >
              Clip 01 — The Death of Traditional PMs
            </h1>
            <span
              className="px-space-xs py-0.5 rounded font-mono-code text-[11px] bg-tertiary-fixed text-on-tertiary-fixed font-semibold shrink-0"
            >
              9:16 VERTICAL
            </span>
          </div>
          <span
            className="font-body-sm text-body-sm text-secondary truncate"
          >
            Master Sequence • Source: Keynote_Ep04_Full_4K.mp4
          </span>
        </div>
        <div
          className="flex items-center gap-0.5 ml-space-sm bg-surface-container-high rounded p-0.5"
        >
          <button
            aria-label="Undo"
            className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">undo</span>
          </button>
          <button
            aria-label="Redo"
            className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">redo</span>
          </button>
        </div>
      </div>

      {/* Center: Format Selector & Zoom */}
      <div className="flex items-center gap-space-md">
        <div
          className="flex items-center bg-surface-container-highest p-0.5 rounded"
        >
          <button
            className="px-space-sm py-1 rounded font-label-md text-label-md bg-surface-bright text-on-surface font-shadow-sm flex items-center gap-1"
            type="button"
          >
            <span className="material-symbols-outlined text-[14px] text-primary">crop_portrait</span>
            <span>9:16 Shorts</span>
          </button>
          <button
            className="px-space-sm py-1 rounded font-label-md text-label-md text-secondary hover:text-on-surface transition-colors flex items-center gap-1"
            type="button"
          >
            <span className="material-symbols-outlined text-[14px]">crop_16_9</span>
            <span>16:9 Landscape</span>
          </button>
          <button
            className="px-space-sm py-1 rounded font-label-md text-label-md text-secondary hover:text-on-surface transition-colors flex items-center gap-1"
            type="button"
          >
            <span className="material-symbols-outlined text-[14px]">crop_square</span>
            <span>1:1 Square</span>
          </button>
        </div>
        <div
          className="hidden xl:flex items-center gap-1 bg-surface-container px-space-sm py-1 rounded text-secondary font-mono-code text-mono-code"
        >
          <span className="material-symbols-outlined text-[16px]">zoom_in</span>
          <span>Canvas: 78%</span>
        </div>
      </div>

      {/* Right: Autosave & Primary CTAs */}
      <div className="flex items-center gap-space-sm">
        <button
          className="px-space-md py-1.5 rounded font-label-lg text-label-lg text-secondary hover:text-on-surface hover:bg-surface-container transition-colors flex items-center gap-1"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">cloud_done</span>
          <span className="hidden sm:inline">Saved</span>
        </button>
        <button
          className="bg-primary hover:bg-surface-tint text-surface-bright px-space-lg py-2 rounded-b-lg font-label-lg text-label-lg font-semibold tracking-wide flex items-center gap-1.5 shadow-sm transition-all transform active:scale-95"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">movie</span>
          <span>Export Finished Clip</span>
        </button>
      </div>
    </section>
  );
};