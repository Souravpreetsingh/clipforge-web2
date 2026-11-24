import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { Metadata } from "@/app/(dashboard)/layout";

export const metadata: Metadata = {
  title: "ClipForge AI — Dashboard",
  description: "Dashboard - ClipForge AI video clipping platform",
};

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <Sidebar />
      <main className="flex-1 ml-64 pr-8 overflow-y-auto">
        <TopBar />

        <section className="bg-surface-container-low rounded-xl p-6 md:p-12">
          {/* Top Welcome & System Status Bar */}
          <section
            className="bg-surface-container-low rounded-xl p-6 md:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6 shadow-sm"
          >
            <div className="flex flex-col gap-2 max-w-2xl">
              <div className="flex items-center gap-space-xs">
                <span
                  className="font-mono-code text-mono-code text-primary uppercase tracking-wider font-semibold"
                >
                  Workspace / Studio Acme Pro
                </span>
                <span
                  className="inline-block w-1 h-1 rounded-full bg-outline"
                />
                <span
                  className="font-mono-code text-mono-code text-secondary"
                >
                  Cycle resets in 11 days
                </span>
              </div>
              <h1
                className="font-headline-lg text-headline-lg text-on-surface"
              >
                Good morning, Elena.
              </h1>
              <p
                className="font-body-md text-body-md text-on-surface-variant"
              >
                You have <span className="font-semibold text-primary">140 AI clipping minutes</span> available this billing cycle. 2 queued exports are compiling in background nodes.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-space-md shrink-0">
              <button
                className="bg-surface-container-lowest hover:bg-surface-container text-on-surface px-space-lg py-2.5 rounded-lg font-label-lg text-label-lg font-medium transition-colors shadow-sm flex items-center gap-space-xs"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">add_box</span>
                <span>Create Project</span>
              </button>
              <button
                className="bg-primary-container hover:bg-surface-tint text-surface-bright px-space-xl py-2.5 rounded-b-lg font-label-lg text-label-lg font-semibold tracking-wide flex items-center gap-space-sm transition-colors shadow-sm"
                type="button"
              >
                <span className="material-symbols-outlined text-[20px]">upload_file</span>
                <span>Upload Video</span>
              </button>
            </div>
          </section>

          {/* Metrics Grid (4 Stat Cards) */}
          <section
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6"
          >
            {/* Stat 1: Videos Processed */}
            <div
              className="bg-surface-container-lowest rounded-xl flex flex-col justify-between shadow-sm hover:shadow-sm transition-shadow"
            >
              <div
                className="flex items-center justify-between text-secondary"
              >
                <span
                  className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold"
                >
                  Videos Processed
                </span>
                <span
                  className="material-symbols-outlined text-[20px] text-tertiary"
                >
                  movie
                </span>
              </div>
              <div
                className="mt-4 flex items-baseline justify-between"
              >
                <span
                  className="font-headline-lg text-headline-lg text-on-surface font-semibold"
                >
                  48
                </span>
                <span
                  className="inline-flex items-center gap-0.5 font-mono-code text-mono-code text-primary bg-primary-fixed/40 px-1.5 py-0.5 rounded text-xs font-medium"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    trending_up
                  </span>
                  +12% mo
                </span>
              </div>
              <div
                className="mt-2 font-body-sm text-body-sm text-secondary"
              >
                Total source footage: 38h 14m
              </div>
            </div>

            {/* Stat 2: Viral Clips Created */}
            <div
              className="bg-surface-container-lowest rounded-xl flex flex-col justify-between shadow-sm hover:shadow-sm transition-shadow"
            >
              <div
                className="flex items-center justify-between text-secondary"
              >
                <span
                  className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold"
                >
                  Viral Clips Created
                </span>
                <span
                  className="material-symbols-outlined text-[20px] text-primary"
                >
                  auto_awesome
                </span>
              </div>
              <div
                className="mt-4 flex items-baseline justify-between"
              >
                <span
                  className="font-headline-lg text-headline-lg text-on-surface font-semibold"
                >
                  214
                </span>
                <span
                  className="font-mono-code text-mono-code text-on-tertiary-container bg-tertiary-fixed px-2 py-0.5 rounded-full text-xs font-semibold"
                >
                  88/100 avg
                </span>
              </div>
              <div
                className="mt-2 font-body-sm text-body-sm text-secondary"
              >
                High virality hook index (>85 score)
              </div>
            </div>

            {/* Stat 3: AI Credits Left */}
            <div
              className="bg-surface-container-lowest rounded-xl flex flex-col justify-between shadow-sm hover:shadow-sm transition-shadow"
            >
              <div
                className="flex items-center justify-between text-secondary"
              >
                <span
                  className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold"
                >
                  AI Credits Left
                </span>
                <span
                  className="material-symbols-outlined text-[20px] text-primary"
                >
                  bolt
                </span>
              </div>
              <div
                className="mt-4 flex items-baseline gap-1"
              >
                <span
                  className="font-headline-lg text-headline-lg text-on-surface font-semibold"
                >
                  140
                </span>
                <span
                  className="font-mono-code text-mono-code text-secondary"
                >
                  / 200m
                </span>
              </div>
              <span
                className="font-mono-code text-mono-code text-secondary text-xs"
              >
                70% remain
              </span>
              <div
                className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden"
              >
                <div
                  className="bg-primary-container h-full rounded-full"
                  style="width: 70%"
                ></div>
              </div>
            </div>

            {/* Stat 4: Render Queue */}
            <div
              className="bg-surface-container-lowest rounded-xl flex flex-col justify-between shadow-sm hover:shadow-sm transition-shadow"
            >
              <div
                className="flex items-center justify-between text-secondary"
              >
                <span
                  className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold"
                >
                  Render Queue
                </span>
                <span
                  className="material-symbols-outlined text-[20px] text-tertiary animate-spin"
                >
                  sync
                </span>
              </div>
              <div
                className="mt-4 flex items-baseline justify-between"
              >
                <span
                  className="font-headline-lg text-headline-lg text-on-surface font-semibold"
                >
                  2 Active
                </span>
                <span
                  className="inline-flex items-center gap-1 font-mono-code text-mono-code text-on-primary-container bg-primary-fixed px-2 py-0.5 rounded text-xs font-semibold"
                >
                  ETA 4m
                </span>
              </div>
              <div
                className="mt-2 font-body-sm text-body-sm text-secondary"
              >
                1080x1920 9:16 Shorts batch
              </div>
            </div>
          </section>

          {/* Quick-Start Action Deck */}
          <section
            className="flex flex-col gap-4 mt-6"
          >
            <div
              className="flex items-center justify-between"
            >
              <div>
                <span
                  className="font-headline-sm text-headline-sm text-on-surface"
                >
                  Quick Capture Engines
                </span>
                <span
                  className="font-label-md text-label-md bg-surface-container px-2 py-0.5 rounded text-secondary font-mono-code uppercase"
                >
                  Instant Ingest
                </span>
              </div>
              <span
                className="font-body-sm text-body-sm text-secondary hidden sm:inline"
              >
                Select input pipeline for automatic chaptering & speech segmentation
              </span>
            </div>

            <div
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              {/* Card 1: Manila Tinted (Hero Action) */}
              <div
                className="bg-tertiary-fixed/30 hover:bg-tertiary-fixed/45 rounded-xl p-6 flex flex-col justify-between transition-colors shadow-sm group cursor-pointer"
              >
                <div className="flex flex-col gap-2">
                  <div
                    className="flex items-center justify-between"
                  >
                    <span
                      className="w-10 h-10 rounded-lg bg-surface-container-lowest flex items-center justify-center text-primary group-hover:scale-105 transition-transform shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[22px]">podcasts</span>
                    </span>
                    <span
                      className="font-label-md text-label-md px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-semibold uppercase"
                    >
                      Recommended
                    </span>
                  </div>
                  <h2
                    className="font-headline-sm text-headline-sm text-on-surface group-hover:text-primary transition-colors"
                  >
                    Drop Podcast or Webinar
                  </h2>
                  <p
                    className="font-body-sm text-body-sm text-on-surface-variant"
                  >
                    Upload uncompressed MP4, MOV, or audio stems. AI segments monologue hooks, guest turns, and topical punches.
                  </p>
                </div>
                <div
                  className="mt-6 flex items-center justify-between pt-4 text-on-surface"
                >
                  <span
                    className="font-mono-code text-mono-code text-xs text-secondary"
                  >
                    Up to 4K • 3hr file limit
                  </span>
                  <span
                    className="material-symbols-outlined text-[20px] text-primary group-hover:translate-x-1 transition-transform"
                  >
                    arrow_forward
                  </span>
                </div>
              </div>

              {/* Card 2: Ivory Pure (URL Import) */}
              <div
                className="bg-surface-container-lowest hover:bg-surface-container-low rounded-xl p-6 flex flex-col justify-between transition-colors shadow-sm group cursor-pointer"
              >
                <div className="flex flex-col gap-2">
                  <div
                    className="flex items-center justify-between"
                  >
                    <span
                      className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-secondary group-hover:text-primary group-hover:scale-105 transition-all shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[22px]">link</span>
                    </span>
                    <span
                      className="font-mono-code text-mono-code text-xs text-secondary"
                    >
                      Direct Fetch
                    </span>
                  </div>
                  <h2
                    className="font-headline-sm text-headline-sm text-on-surface group-hover:text-primary transition-colors"
                  >
                    Paste YouTube or Vimeo URL
                  </h2>
                  <p
                    className="font-body-sm text-body-sm text-on-surface-variant"
                  >
                    Zero upload time. Fetches full transcripts, captions, and speaker tracks remotely within seconds.
                  </p>
                </div>
                <div
                  className="mt-6 flex items-center justify-between pt-4 text-on-surface"
                >
                  <span
                    className="font-mono-code text-mono-code text-xs text-secondary"
                  >
                    Supports Livestreams
                  </span>
                  <span
                    className="material-symbols-outlined text-[20px] text-secondary group-hover:text-primary group-hover:translate-x-1 transition-all"
                  >
                    arrow_forward
                  </span>
                </div>
              </div>

              {/* Card 3: Ivory Pure (Semantic Topic Extraction) */}
              <div
                className="bg-surface-container-lowest hover:bg-surface-container-low rounded-xl p-6 flex flex-col justify-between transition-colors shadow-sm group cursor-pointer"
              >
                <div
                  className="flex flex-col gap-2"
                >
                  <div
                    className="flex items-center justify-between"
                  >
                    <span
                      className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-secondary group-hover:text-primary group-hover:scale-105 transition-all shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[22px]">manage_search</span>
                    </span>
                    <span
                      className="font-mono-code text-mono-code text-xs text-secondary"
                    >
                      Semantic Query
                    </span>
                  </div>
                  <h2
                    className="font-headline-sm text-headline-sm text-on-surface group-hover:text-primary transition-colors"
                  >
                    Extract Highlights by Topic
                  </h2>
                  <p
                    className="font-body-sm text-body-sm text-on-surface-variant"
                  >
                    Target phrases like "how we scaled to $10M" or "breakup story". Model scans vector embeddings for exact moments.
                  </p>
                </div>
                <div
                  className="mt-6 flex items-center justify-between pt-4 text-on-surface"
                >
                  <span
                    className="font-mono-code text-mono-code text-xs text-secondary"
                  >
                    Prompt-driven cutlist
                  </span>
                  <span
                    className="material-symbols-outlined text-[20px] text-secondary group-hover:text-primary group-hover:translate-x-1 transition-all"
                  >
                    arrow_forward
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Workspace Center: Recent Projects & Activity Split */}
          <section
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6"
          >
            {/* Projects Main Column (8 cols) */}
            <div
              lg:col-span-8
              className="flex flex-col gap-4"
            >
              <div
                className="flex items-center justify-between"
              >
                <div
                  className="flex items-center gap-space-xs"
                >
                  <h2
                    className="font-headline-sm text-headline-sm text-on-surface"
                  >
                    Recent Projects
                  </h2>
                  <span
                    className="font-mono-code text-mono-code text-xs text-secondary px-2 py-0.5 bg-surface-container rounded-full"
                  >
                    5 Total
                  </span>
                </div>
                <div
                  className="flex items-center gap-space-xs"
                >
                  <button
                    className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[20px]">view_module</span>
                  </button>
                  <button
                    className="p-1 rounded text-on-surface bg-surface-container transition-colors"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[20px]">format_list_bulleted</span>
                  </button>
                </div>
              </div>

              {/* Project List Container */}
              <div
                className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col"
              >
                {/* Row 1: High Viral Success (Ready) */}
                <div
                  className="p-4 md:p-5 hover:bg-surface-container-low transition-colors flex flex-col md:flex-row items-start md:items-center justify-between md:gap-4 group"
                >
                  <div
                    className="flex items-center gap-space-md min-w-0"
                  >
                    <div
                      className="relative w-28 h-18 rounded-lg overflow-hidden shrink-0 bg-surface-container-high shadow-inner"
                    >
                      <img
                        className="w-full h-full object-cover"
                        data-alt="Close up cinematic interview frame of podcast host in dark studio with soft amber rim lighting speaking into a broadcast microphone"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuA2jW760IO9IdJZcLgpDcki75alcKeebz7Q_2rKRFnr9GQGc04VBWpza-BknlM9-qPEKm7gYGZMwp_VoFBWZB09U5L4_Qc7Q_bi6j3iyC8gih66MBulquNLoFh_8uiXOsA5cvrDFaaJ_FdDzZjsN5-FFkzU3iA_Tu51ZHmrmAIaiHrfEjqYfaT_qn4o8lTUFbl5ImTf3UPjUEJgxZytHTbTY9jfvnRCQeGm7dsDw-Tm"
                      />
                      <span
                        className="absolute bottom-1 right-1 font-mono-code text-[10px] px-1 rounded bg-inverse-surface/85 text-inverse-on-surface"
                      >
                        54:20
                      </span>
                      <span
                        className="absolute top-1 left-1 font-mono-code text-[9px] font-bold px-1 rounded bg-primary-container text-surface-bright"
                      >
                        9:16 + 16:9
                      </span>
                    </div>
                    <div
                      className="flex flex-col min-w-0"
                    >
                      <div
                        className="flex items-center gap-space-xs"
                      >
                        <span
                          className="font-label-md text-label-md px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-semibold"
                        >
                          12 Clips Ready
                        </span>
                        <span
                          className="font-mono-code text-[11px] text-secondary"
                        >
                          Updated 24m ago
                        </span>
                      </div>
                      <h3
                        className="font-body-md text-body-md font-semibold text-on-surface truncate group-hover:text-primary transition-colors mt-0.5"
                      >
                        Lex & Sam Altman: The Autonomous Machine Era
                      </h3>
                      <p
                        className="font-body-sm text-body-sm text-secondary truncate"
                      >
                        Detected 8 viral moments with Virality Score ≥ 90 • Kinetic captions embedded
                      </p>
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-space-xs shrink-0 md:self-center"
                  >
                    <button
                      className="bg-surface-container hover:bg-surface-container-high text-on-surface px-3 py-1.5 rounded-lg font-label-md text-label-md font-medium transition-colors flex items-center gap-1"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">file_download</span>
                      <span>Clips</span>
                    </button>
                    <button
                      className="bg-primary hover:bg-surface-tint text-surface-bright px-3.5 py-1.5 rounded-lg font-label-md text-label-md font-semibold transition-colors flex items-center gap-1 shadow-sm"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">movie_edit</span>
                      <span>Open Studio</span>
                    </button>
                  </div>
                </div>

                {/* Row 2: In-Progress Rendering (Processing) */}
                <div
                  className="p-4 md:p-5 bg-tertiary-fixed/10 hover:bg-tertiary-fixed/20 transition-colors flex flex-col md:flex-row items-start md:items-center justify-between md:gap-4 group"
                >
                  <div
                    className="flex items-center gap-space-md min-w-0"
                  >
                    <div
                      className="relative w-28 h-18 rounded-lg overflow-hidden shrink-0 bg-surface-container-high shadow-inner"
                    >
                      <img
                        className="w-full h-full object-cover"
                        data-alt="Overhead aesthetic desk shot with architectural schematics, warm desk lamp, espresso cup, and designer sketching layout ideas"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuAyLEQ_0u7OdHMrSGWKEmHlVqzPQwxCgbzEcLxYaGG2WsFeLmNtEAFoKuXw9Va3qd9Rzn8yi0HfSyUA9AHrtiyIyTJmjGtfBLaayNSovUTwuUG4Ii3LGe0qRJ7a7YFb6EE_kDCxovbBpwVlC-OK3sKALcBjL4FrcsxLpmtP7L4FDoTeRb8pKMaxdGgqhpCObpazt4NsaBa2EeCOYXxJ5u9wYHOjUulQ_PuiLPLYfW8q"
                      />
                      <div
                        className="absolute inset-0 bg-inverse-surface/60 flex items-center justify-center"
                      >
                        <span
                          className="material-symbols-outlined text-surface-bright animate-spin text-[24px]"
                        >
                          progress_activity
                        </span>
                      </span>
                      <span
                        className="absolute bottom-1 right-1 font-mono-code text-[10px] px-1 rounded bg-inverse-surface/85 text-inverse-on-surface"
                      >
                        1:18:04
                      </span>
                    </div>
                    <div
                      className="flex flex-col min-w-0"
                    >
                      <div
                        className="flex items-center gap-space-xs"
                      >
                        <span
                          className="font-label-md text-label-md px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center gap-1"
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"
                          />
                          AI Transcribing (64%)
                        </span>
                        <span
                          className="font-mono-code text-[11px] text-secondary"
                        >
                          Est. 3m left
                        </span>
                      </div>
                      <h3
                        className="font-body-md text-body-md font-semibold text-on-surface truncate group-hover:text-primary transition-colors mt-0.5"
                      >
                        Quarterly Design Systems Masterclass with J. Doe
                      </h3>
                      <p
                        className="font-body-sm text-body-sm text-secondary truncate"
                      >
                        Extracting multi-speaker dialog, generating autotags & B-roll overlays
                      </p>
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-space-xs shrink-0 md:self-center"
                  >
                    <button
                      className="bg-surface-container-lowest hover:bg-surface-container text-secondary hover:text-on-surface px-3 py-1.5 rounded-lg font-label-md text-label-md font-medium transition-colors flex items-center gap-1 shadow-sm"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">pause</span>
                      <span>Pause</span>
                    </button>
                    <button
                      className="bg-surface-container-highest text-secondary px-3.5 py-1.5 rounded-lg font-label-md text-label-md font-medium cursor-not-allowed"
                      type="button"
                    >
                      <span>Rendering...</span>
                    </button>
                  </div>
                </div>

                {/* Row 3: Standard Finished (Ready) */}
                <div
                  className="p-4 md:p-5 hover:bg-surface-container-low transition-colors flex flex-col md:flex-row items-start md:items-center justify-between md:gap-4 group"
                >
                  <div
                    className="flex items-center gap-space-md min-w-0"
                  >
                    <div
                      className="relative w-28 h-18 rounded-lg overflow-hidden shrink-0 bg-surface-container-high shadow-inner"
                    >
                      <img
                        className="w-full h-full object-cover"
                        data-alt="High tech presentation stage with warm timber backdrop and presenter holding clicker under soft theater spotlight"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuAzSGvSdoJm7SsEThqz_FBdIwLWsREWeRhN93L9w47dw0siJqLDoqxbG-EEpv15NSQC0KIa-2TP19uC2rOWcQuEe5amVxW1aJYiHErrJL-HZD98xAoAaXKOvGmaC7_uSbHi4dK0kWHGzSCPzNeXChd8WLMkeKEFZM9Sidqx4x1sQ7sZtVYSJ6aFk7CFalo-Yz9haZHCK1X4FMG5pqWeCOGEvLKLo0Wo84R5xIBpUfTM"
                      />
                      <span
                        className="absolute bottom-1 right-1 font-mono-code text-[10px] px-1 rounded bg-inverse-surface/85 text-inverse-on-surface"
                      >
                        28:15
                      </span>
                      <span
                        className="absolute top-1 left-1 font-mono-code text-[9px] font-bold px-1 rounded bg-inverse-surface/80 text-surface-bright"
                      >
                        9:16 Shorts
                      </span>
                    </div>
                    <div
                      className="flex flex-col min-w-0"
                    >
                      <div
                        className="flex items-center gap-space-xs"
                      >
                        <span
                          className="font-label-md text-label-md px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-semibold"
                        >
                          6 Clips Ready
                        </span>
                        <span
                          className="font-mono-code text-[11px] text-secondary"
                        >
                          Yesterday
                        </span>
                      </div>
                      <h3
                        className="font-body-md text-body-md font-semibold text-on-surface truncate group-hover:text-primary transition-colors mt-0.5"
                      >
                        Founders AMA: Bootstrapping to First 10,000 Users
                      </h3>
                      <p
                        className="font-body-sm text-body-sm text-secondary truncate"
                      >
                        Brand Kit applied: Studio Acme Serif Orange • 1080x1920 60fps
                      </p>
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-space-xs shrink-0 md:self-center"
                  >
                    <button
                      className="bg-surface-container hover:bg-surface-container-high text-on-surface px-3 py-1.5 rounded-lg font-label-md text-label-md font-medium transition-colors flex items-center gap-1"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">share</span>
                      <span>Export</span>
                    </button>
                    <button
                      className="bg-primary hover:bg-surface-tint text-surface-bright px-3.5 py-1.5 rounded-lg font-label-md text-label-md font-semibold transition-colors flex items-center gap-1 shadow-sm"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">movie_edit</span>
                      <span>Open Studio</span>
                    </button>
                  </div>
                </div>

                {/* Row 4: Draft Project */}
                <div
                  className="p-4 md:p-5 hover:bg-surface-container-low transition-colors flex flex-col md:flex-row items-start md:items-center justify-between md:gap-4 group"
                >
                  <div
                    className="flex items-center gap-space-md min-w-0"
                  >
                    <div
                      className="relative w-28 h-18 rounded-lg overflow-hidden shrink-0 bg-surface-container-high shadow-inner"
                    >
                      <img
                        className="w-full h-full object-cover"
                        data-alt="Minimalist recording room with warm paper lantern hanging over vintage studio monitors and leather armchair"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuDrPwkAzYhvacjso8zec3-vi_UJKHaaJNU5LQ9cEjOwZrk-awjBw3WVyRhKBM1Kf8-xE4JMFX-2unjC12u--HoEYRJIyEGsnTfMTsam9kVm7n_lZtwhME6pHeUiB4707L23dk716o1f8QEwzNmF79oHmXpW_5Fd6elDlA9tJnC3qmWalcWKw3pSgdxyuZTBBxwEkJQg4uO0ysdkS0I0910kSiQFiMz3nZl5vqTOfQVL"
                      />
                      <span
                        className="absolute bottom-1 right-1 font-mono-code text-[10px] px-1 rounded bg-inverse-surface/85 text-inverse-on-surface"
                      >
                        42:10
                      </span>
                    </div>
                    <div
                      className="flex flex-col min-w-0"
                    >
                      <div
                        className="flex items-center gap-space-xs"
                      >
                        <span
                          className="font-label-md text-label-md px-2 py-0.5 rounded-full bg-surface-container text-secondary font-semibold"
                        >
                          Draft Cutlist
                        </span>
                        <span
                          className="font-mono-code text-[11px] text-secondary"
                        >
                          3 days ago
                        </span>
                      </div>
                      <h3
                        className="font-body-md text-body-md font-semibold text-on-surface truncate group-hover:text-primary transition-colors mt-0.5"
                      >
                        The Creative Journey Ep. 14: Typography in Editorial Media
                      </h3>
                      <p
                        className="font-body-sm text-body-sm text-secondary truncate"
                      >
                        3 manual markers placed • Awaiting AI viral highlight pass
                      </p>
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-space-xs shrink-0 md:self-center"
                  >
                    <button
                      className="bg-primary-container hover:bg-surface-tint text-surface-bright px-3.5 py-1.5 rounded-lg font-label-md text-label-md font-medium transition-colors flex items-center gap-1 shadow-sm"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                      <span>Resume</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Inspector & Activity Sidebar Column (4 cols) */}
              <div
                lg:col-span-4
                className="flex flex-col gap-4"
              >
                {/* Real-time Activity Feed */}
                <div
                  className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col gap-4"
                >
                  <div
                    className="flex items-center justify-between"
                  >
                    <div
                      className="flex items-center gap-space-xs"
                    >
                      <span
                        className="w-2 h-2 rounded-full bg-primary animate-ping"
                      />
                      <h3
                        className="font-headline-sm text-headline-sm text-on-surface"
                      >
                        Activity Stream
                      </h3>
                    </div>
                    <span
                      className="font-mono-code text-mono-code text-xs text-secondary"
                    >
                      Live
                    </span>
                  </div>
                  <div
                    className="flex flex-col gap-4"
                  >
                    {/* Feed Item 1 */}
                    <div
                      className="flex items-start gap-space-xs"
                    >
                      <div
                        className="w-7 h-7 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed shrink-0 mt-0.5"
                      >
                        <span
                          className="material-symbols-outlined text-[15px]"
                        >
                          auto_awesome
                        </span>
                      </div>
                      <div
                        className="flex flex-col min-w-0"
                      >
                        <span
                          className="font-body-sm text-body-sm font-semibold text-on-surface"
                        >
                          Tim Ferriss Ep. 620
                        </span>
                        <p
                          className="font-body-sm text-body-sm text-secondary line-clamp-2"
                        >
                          AI extracted 6 high-scoring clips (Peak virality: <span
                            className="font-semibold text-primary"
                          >94/100</span>).
                        </p>
                        <span
                          className="font-mono-code text-[10px] text-outline mt-0.5"
                        >
                          Just now
                        </span>
                      </div>
                    </div>

                    {/* Feed Item 2 */}
                    <div
                      className="flex items-start gap-space-xs"
                    >
                      <div
                        className="w-7 h-7 rounded-full bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed shrink-0 mt-0.5"
                      >
                        <span
                          className="material-symbols-outlined text-[15px]"
                        >
                          check_circle
                        </span>
                      </div>
                      <div
                        className="flex flex-col min-w-0"
                      >
                        <span
                          className="font-body-sm text-body-sm font-semibold text-on-surface"
                        >
                          TikTok Batch Render Finished
                        </span>
                        <p
                          className="font-body-sm text-body-sm text-secondary"
                        >
                          Rendered 4 clips with animated captions in 1080x1920 format.
                        </p>
                        <span
                          className="font-mono-code text-[10px] text-outline mt-0.5"
                        >
                          18 mins ago
                        </span>
                      </div>
                    </div>

                    {/* Feed Item 3 */}
                    <div
                      className="flex items-start gap-space-xs"
                    >
                      <div
                        className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center text-secondary shrink-0 mt-0.5"
                      >
                        <span
                          className="material-symbols-outlined text-[15px]"
                        >
                          cloud_upload
                        </span>
                      </div>
                      <div
                        className="flex flex-col min-w-0"
                      >
                        <span
                          className="font-body-sm text-body-sm font-semibold text-on-surface"
                        >
                          YouTube Ingest Completed
                        </span>
                        <p
                          className="font-body-sm text-body-sm text-secondary"
                        >
                          Successfully parsed transcript for "SaaS Growth Playbook 2025".
                        </p>
                        <span
                          className="font-mono-code text-[10px] text-outline mt-0.5"
                        >
                          2 hours ago
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cloud Storage & Resource Quota Card */}
                <div
                  className="bg-surface-container-low rounded-xl p-4 shadow-sm flex flex-col gap-4"
                >
                  <div
                    className="flex items-center justify-between"
                  >
                    <span
                      className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold"
                    >
                      Studio Storage
                    </span>
                    <span
                      className="font-mono-code text-mono-code text-xs text-primary font-semibold"
                    >
                      32.4 / 100 GB
                    </span>
                  </div>
                  <div
                    className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden"
                  >
                    <div
                      className="bg-primary h-full rounded-full"
                      style="width: 32.4%"
                    ></div>
                  </div>
                  <div
                    className="grid grid-cols-2 gap-space-xs font-body-sm text-body-sm"
                  >
                    <div
                      className="bg-surface-container-lowest p-space-sm rounded-lg flex flex-col"
                    >
                      <span
                        className="text-secondary text-[11px]"
                      >
                        Source Footage
                      </span>
                      <span
                        className="font-mono-code text-mono-code font-semibold text-on-surface"
                      >
                        26.1 GB
                      </span>
                    </div>
                    <div
                      className="bg-surface-container-lowest p-space-sm rounded-lg flex flex-col"
                    >
                      <span
                        className="text-secondary text-[11px]"
                      >
                        Rendered Clips
                      </span>
                      <span
                        className="font-mono-code text-mono-code font-semibold text-on-surface"
                      >
                        6.3 GB
                      </span>
                    </div>
                  </div>
                </div>

                {/* Active Brand Kits Module */}
                <div
                  className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col gap-4"
                >
                  <div
                    className="flex items-center justify-between"
                  >
                    <h3
                      className="font-headline-sm text-headline-sm text-on-surface"
                    >
                      Active Brand Kit
                    </h3>
                    <a
                      className="font-label-md text-label-md text-primary hover:underline font-semibold"
                      href="#">
                      Manage
                    </a>
                  </div>
                  <div
                    className="bg-surface-container-low rounded-lg p-space-sm flex items-center justify-between mt-2"
                  >
                    <div
                      className="flex items-center gap-space-xs"
                    >
                      <div
                        className="w-7 h-7 rounded bg-primary-container flex items-center justify-center text-surface-bright font-serif font-bold text-sm"
                      >
                        S
                      </div>
                      <div
                        className="flex flex-col"
                      >
                        <span
                          className="font-body-md text-body-md font-semibold text-on-surface"
                        >
                          Acme Editorial Serif
                        </span>
                        <span
                          className="font-mono-code text-[11px] text-secondary"
                        >
                          Source Serif 4 + Terracotta Glow
                        </span>
                      </div>
                    </div>
                    <span
                      className="material-symbols-outlined text-secondary text-[18px]"
                    >
                      verified
                    </span>
                  </div>
                  <p
                    className="font-body-sm text-body-sm text-secondary mt-1"
                  >
                    Auto-applies logo watermarks, brand color palette, and kinetic
                    captions to all generated clips.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}