"use client";

import { MaterialIcon } from "@radix-ui/react-icons";
import { useState } from "react";

export const Sidebar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <aside
      className="fixed left-0 top-0 h-full w-64 bg-inverse-surface text-inverse-on-surface z-50 flex flex-col justify-between border-r border-outline-variant/20 select-none"
    >
      <div className="flex flex-col">
        {/* Logo and workspace name */}
        <div className="p-6 border-b border-outline-variant/15 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              alt="ClipForge AI Logo"
              className="h-8 w-auto object-contain"
              src="https://lh3.googleusercontent.com/aida/ALJJyrBV9sLOl3sYOefYAERSjLjSn-zNRs0qJaAXsJ1XX2oGWSkO1nBNa1fdBE-jyfJEdznEyH7FE-NW8iXWDlG7fWdHeWceBMPHDOto4kQsYzZi0-IUyUSMtYloHtK8j1d73lTOJlgLfcZS0KAI-YIZARA7z7afux8b3uir5UaBVL_bVOrVE15yUw3k3GevP22pk7bcRpt8VkHsOyeGzBMP_tkUOWKWhYSBoeRl6LFvzVCBsw"
            />
            <span className="font-headline-sm text-headline-sm font-semibold tracking-tight text-surface-bright">ClipForge</span>
          </div>
          <span
            className="px-2 py-0.5 rounded text-[10px] uppercase font-mono-code bg-primary-container text-surface-bright font-bold"
          >
            AI
          </span>
        </div>

        {/* Studio name / workspace switcher */}
        <div className="px-6 py-2">
          <div className="flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px] text-tertiary-fixed">apartment</span>
            <span class="font-label-lg text-label-lg font-medium truncate">Studio Acme Pro</span>
          </div>
          <button
            className="w-full flex items-center justify-between px-2 py-2 rounded bg-surface-container-highest/10 hover:bg-surface-container-highest/20 transition-colors text-inverse-on-surface border border-outline-variant/15"
            type="button"
          >
            <span class="material-symbols-outlined text-[18px] text-tertiary-fixed">unfold_more</span>
            <span class="font-label-lg text-label-lg font-medium truncate">Studio Acme Pro</span>
          </button>
        </div>

        {/* Navigation */}
        <nav
          className="flex flex-col gap-0.5 px-6 mt-6 select-none"
          data-active-classes="bg-surface-container-highest/25 text-surface-bright font-medium"
        >
          <a
            aria-current="page"
            className="flex items-center gap-3 px-4 py-3 rounded transition-all bg-surface-container-highest/25 text-surface-bright font-medium"
            data-path="dashboard"
          >
            <span className="material-symbols-outlined text-[18px]">dashboard</span>
            <span className="truncate">Dashboard</span>
          </a>
          <a
            className="flex items-center gap-3 px-4 py-3 rounded hover:bg-surface-container-highest/15 hover:text-surface-bright transition-all font-l"
            data-path="projects"
          >
            <span className="material-symbols-outlined text-[18px]">grid_on</span>
            <span className="truncate">Projects</span>
          </a>
          <a
            className="flex items-center gap-3 px-4 py-3 rounded hover:bg-surface-container-highest/15 hover:text-surface-bright transition-all font-l"
            data-path="upload"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            <span className="truncate">Upload</span>
          </a>
          <a
            className="flex items-center gap-3 px-4 py-3 rounded hover:bg-surface-container-highest/15 hover:text-surface-bright transition-all font-l"
            data-path="ai-clipper"
          >
            <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
            <span className="truncate">AI Clipper</span>
          </a>
          <a
            className="flex items-center gap-3 px-4 py-3 rounded hover:bg-surface-container-highest/15 hover:text-surface-bright transition-all font-l"
            data-path="clips"
          >
            <span className="material-symbols-outlined text-[18px]">featured_video</span>
            <span className="truncate">Clips</span>
          </a>
          <a
            className="flex items-center gap-3 px-4 py-3 rounded hover:bg-surface-container-highest/15 hover:text-surface-bright transition-all font-l"
            data-path="editor"
          >
            <span className="material-symbols-outlined text-[18px]">movie</span>
            <span className="truncate">Editor</span>
          </a>
          <a
            className="flex items-center gap-3 px-4 py-3 rounded hover:bg-surface-container-highest/15 hover:text-surface-bright transition-all font-l"
            data-path="subtitles"
          >
            <span className="material-symbols-outlined text-[18px]">text_fields</span>
            <span className="truncate">Subtitles</span>
          </a>
          <a
            className="flex items-center gap-3 px-4 py-3 rounded hover:bg-surface-container-highest/15 hover:text-surface-bright transition-all font-l"
            data-path="templates"
          >
            <span className="material-symbols-outlined text-[18px]">design_services</span>
            <span className="truncate">Templates</span>
          </a>
          <a
            className="flex items-center gap-3 px-4 py-3 rounded hover:bg-surface-container-highest/15 hover:text-surface-bright transition-all font-l"
            data-path="brand-kit"
          >
            <span className="material-symbols-outlined text-[18px]">palette</span>
            <span className="truncate">Brand Kit</span>
          </a>
          <a
            className="flex items-center gap-3 px-4 py-3 rounded hover:bg-surface-container-highest/15 hover:text-surface-bright transition-all font-l"
            data-path="exports"
          >
            <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
            <span className="truncate">Exports</span>
          </a>
          <a
            className="flex items-center gap-3 px-4 py-3 rounded hover:bg-surface-container-highest/15 hover:text-surface-bright transition-all font-l"
            data-path="settings"
          >
            <span className="material-symbols-outlined text-[18px]">settings</span>
            <span className="truncate">Settings</span>
          </a>
        </nav>
      </div>

      {/* Bottom actions */}
      <div className="p-6 border-t border-outline-variant/15 flex flex-col items-center justify-between">
        <div className="flex items-center gap-2 px-2 py-1 rounded bg-surface-container-highest/10 hover:bg-surface-container-highest/20 transition-colors text-inverse-on-surface border border-outline-variant/15">
          <span class="material-symbols-outlined text-[18px] text-tertiary-fixed">search</span>
          <input
            type="search"
            className="flex-1 bg-transparent placeholder-surface-container text-on-surface font-label-md placeholder-placeholder"
            placeholder="Search..."
            readOnly
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            className="w-8 h-8 rounded-full bg-primary animate-pulse"
            type="button"
            aria-label="Add new"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
          <button
            className="hidden sm:flex items-center gap-1 px-2 py-1.5 rounded font-label-md text-label-md transition-colors shadow-sm"
            type="button"
          >
            <span class="material-symbols-outlined text-[18px]">notifications</span>
            <span className="font-mono-code text-[10px] text-secondary">3</span>
          </button>
        </div>
      </div>
    </aside>
  );
};