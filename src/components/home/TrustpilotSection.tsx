import { useEffect, useRef, useState } from 'react';

const TRUSTPILOT_SCRIPT_ID = 'trustpilot-widget-script';
const TRUSTPILOT_SCRIPT_SRC = 'https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js';
const TRUSTPILOT_TEMPLATE_ID = import.meta.env.VITE_TRUSTPILOT_TEMPLATE_ID?.trim() || '5419b6a8b0d04a076446a9ad';
const TRUSTPILOT_LOCALE = import.meta.env.VITE_TRUSTPILOT_LOCALE?.trim() || 'en-US';
const TRUSTPILOT_THEME = import.meta.env.VITE_TRUSTPILOT_THEME?.trim() || 'light';
const TRUSTPILOT_REVIEW_URL =
  import.meta.env.VITE_TRUSTPILOT_REVIEW_URL?.trim() || 'https://www.trustpilot.com/';
const TRUSTPILOT_BUSINESS_UNIT_ID = '693c0ff4c83da4b069ddddc0';

type TrustpilotWindow = Window & {
  Trustpilot?: {
    loadFromElement?: (element: Element, forceReload?: boolean) => void;
  };
};

export function TrustpilotSection() {
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [widgetError, setWidgetError] = useState(false);

  useEffect(() => {
    let active = true;

    if (!TRUSTPILOT_TEMPLATE_ID) {
      setWidgetReady(false);
      setWidgetError(true);
      return () => {
        active = false;
      };
    }

    function loadCurrentWidget() {
      const trustpilotWindow = window as TrustpilotWindow;
      const loader = trustpilotWindow.Trustpilot?.loadFromElement;

      if (!loader || !widgetRef.current) {
        return;
      }

      try {
        loader(widgetRef.current, true);
        if (active) {
          setWidgetReady(true);
          setWidgetError(false);
        }
      } catch (error) {
        console.warn('[trustpilot] widget render failed', error);
        if (active) {
          setWidgetReady(false);
          setWidgetError(true);
        }
      }
    }

    async function initWidget() {
      const preflightUrl = `https://widget.trustpilot.com/trustbox-data/${TRUSTPILOT_TEMPLATE_ID}?businessUnitId=${TRUSTPILOT_BUSINESS_UNIT_ID}&locale=${encodeURIComponent(
        TRUSTPILOT_LOCALE,
      )}`;
      const preflight = await fetch(preflightUrl).catch(() => null);

      if (!active) {
        return;
      }

      if (!preflight?.ok) {
        setWidgetReady(false);
        setWidgetError(true);
        console.warn(
          '[trustpilot] Business unit does not have access to this trustbox template. Set VITE_TRUSTPILOT_TEMPLATE_ID to an allowed template.',
        );
        return;
      }

      setWidgetReady(true);

      const existingScript = document.getElementById(TRUSTPILOT_SCRIPT_ID) as HTMLScriptElement | null;

      if (existingScript) {
        if ((window as TrustpilotWindow).Trustpilot) {
          loadCurrentWidget();
          return;
        }

        existingScript.addEventListener('load', loadCurrentWidget, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.id = TRUSTPILOT_SCRIPT_ID;
      script.src = TRUSTPILOT_SCRIPT_SRC;
      script.async = true;
      script.addEventListener('load', loadCurrentWidget, { once: true });
      document.body.appendChild(script);
    }

    void initWidget();

    return () => {
      active = false;
      const existingScript = document.getElementById(TRUSTPILOT_SCRIPT_ID) as HTMLScriptElement | null;
      existingScript?.removeEventListener('load', loadCurrentWidget);
    };
  }, []);

  return (
    <section className="section-shell pt-8">
      <div className="mb-3 flex items-center gap-2 text-slate-900">
        <span className="text-2xl text-emerald-500">★</span>
        <span className="text-3xl font-semibold tracking-tight">Trustpilot</span>
      </div>

      <div
        ref={widgetRef}
        className="trustpilot-widget"
        data-locale={TRUSTPILOT_LOCALE}
        data-template-id={TRUSTPILOT_TEMPLATE_ID}
        data-businessunit-id={TRUSTPILOT_BUSINESS_UNIT_ID}
        data-style-height="140px"
        data-style-width="100%"
        data-theme={TRUSTPILOT_THEME}
        style={{ minHeight: '140px' }}
      >
        <a href={TRUSTPILOT_REVIEW_URL} target="_blank" rel="noopener noreferrer">
          Read our Trustpilot reviews
        </a>
      </div>

      {!widgetReady || widgetError ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          Reviews are temporarily unavailable in this environment.{' '}
          <a className="font-medium text-indigo-600 hover:text-indigo-700" href={TRUSTPILOT_REVIEW_URL} target="_blank" rel="noopener noreferrer">
            View on Trustpilot
          </a>
          .
        </div>
      ) : null}
    </section>
  );
}
