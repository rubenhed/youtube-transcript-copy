const COPY_ICON = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
`;

const CHECK_ICON = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
`;

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  main() {
    const BUTTON_ID = "yt-transcript-copy-btn";

    function getTranscriptPanel(): HTMLElement | null {
      // The panel's own `target-id` attribute is unreliable — YouTube
      // sometimes omits it. `data-target-id="PAmodern_transcript_view"` on
      // the inner yt-section-list-renderer is consistent, so anchor there
      // and walk up to the panel element.
      const marker = document.querySelector(
        '[data-target-id="PAmodern_transcript_view"]',
      );
      return (
        marker?.closest<HTMLElement>(
          "ytd-engagement-panel-section-list-renderer",
        ) ?? null
      );
    }

    function isPanelOpen(panel: HTMLElement): boolean {
      return (
        panel.getAttribute("visibility") ===
        "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"
      );
    }

    function extractTranscriptText(panel: HTMLElement): string {
      const modernSegments = panel.querySelectorAll(
        "transcript-segment-view-model",
      );
      if (modernSegments.length > 0) {
        return Array.from(modernSegments)
          .map((seg) => {
            const timestamp = seg
              .querySelector(".ytwTranscriptSegmentViewModelTimestamp")
              ?.textContent?.trim();
            const text = seg
              .querySelector('span[role="text"]')
              ?.textContent?.trim();
            return timestamp && text ? `${timestamp} ${text}` : (text ?? "");
          })
          .filter(Boolean)
          .join("\n");
      }

      // Fallback for the older ytd-transcript-segment-renderer DOM.
      const legacySegments = panel.querySelectorAll(
        "ytd-transcript-segment-renderer",
      );
      return Array.from(legacySegments)
        .map((seg) => {
          const timestamp = seg
            .querySelector(".segment-timestamp")
            ?.textContent?.trim();
          const text = seg.querySelector(".segment-text")?.textContent?.trim();
          return timestamp && text ? `${timestamp} ${text}` : (text ?? "");
        })
        .filter(Boolean)
        .join("\n");
    }

    function createButton(panel: HTMLElement): HTMLButtonElement {
      const btn = document.createElement("button");
      btn.id = BUTTON_ID;
      btn.type = "button";
      btn.title = "Copy transcript";
      btn.setAttribute("aria-label", "Copy transcript");
      btn.className = "ytChipShapeButtonReset";
      btn.style.cssText = `
        margin-left: auto;
        margin-right: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      `;

      // Reuse YouTube's own "inactive chip" classes for the icon's color —
      // this is the same class the unselected "Chapters" tab text uses, so
      // it already tracks light/dark theme correctly instead of us guessing
      // a CSS variable name that may or may not exist on this page.
      const chip = document.createElement("div");
      chip.className =
        "ytChipShapeChip ytChipShapeInactive ytChipShapeOnlyTextPadding";
      chip.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 6px;
        border-radius: 8px;
        background: none !important;
      `;
      chip.innerHTML = COPY_ICON;
      btn.appendChild(chip);

      btn.addEventListener("click", async () => {
        const text = extractTranscriptText(panel);
        try {
          await navigator.clipboard.writeText(text);
          chip.innerHTML = CHECK_ICON;
        } catch {
          btn.title = "Copy failed";
        } finally {
          setTimeout(() => {
            chip.innerHTML = COPY_ICON;
            btn.title = "Copy transcript";
          }, 1500);
        }
      });

      return btn;
    }

    function injectButton(panel: HTMLElement) {
      if (panel.querySelector(`#${BUTTON_ID}`)) return;

      const subheader = panel.querySelector<HTMLElement>("#subheader");
      if (!subheader) return;

      subheader.style.display = "flex";
      subheader.style.alignItems = "center";
      subheader.appendChild(createButton(panel));
    }

    function tick() {
      const panel = getTranscriptPanel();
      if (panel && isPanelOpen(panel)) {
        injectButton(panel);
      }
    }

    // The panel gets added/removed and its `visibility` attribute flips as
    // the user opens/closes it or navigates between videos — watch both.
    const observer = new MutationObserver(tick);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["visibility"],
    });

    // In case it's already open when the script loads.
    tick();
  },
});
