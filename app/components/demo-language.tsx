import { useEffect, useRef, type ReactNode } from "react";
import { translateDemoText, type DemoLocale } from "../lib/demo-locale";

export function DemoLanguage({ locale, children }: { locale: DemoLocale; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element || locale !== "en") return;
    const originals = new Map<Text | Element, string>();
    const attributes = new Map<Element, Map<string, string>>();
    const observer = new MutationObserver(() => {
      observer.disconnect();
      apply();
      observe();
    });
    const regions = [document.body];

    function apply() {
      for (const region of regions) {
        const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (!node.parentElement || ["SCRIPT", "STYLE", "TEXTAREA", "OPTION"].includes(node.parentElement.tagName)) continue;
          const text = node as Text;
          const original = originals.get(text) ?? text.textContent ?? "";
          if (!originals.has(text)) originals.set(text, original);
          const translated = translateDemoText(original);
          if (translated !== text.textContent) text.textContent = translated;
        }
        for (const item of region.querySelectorAll("[title], [aria-label], [placeholder], option")) {
          if (item.tagName === "OPTION") {
            const text = item.textContent ?? "";
            if (!originals.has(item)) originals.set(item, text);
            if (translateDemoText(text) !== text) item.textContent = translateDemoText(text);
            continue;
          }
          for (const attribute of ["title", "aria-label", "placeholder"]) {
            const value = item.getAttribute(attribute);
            if (!value) continue;
            const original = attributes.get(item)?.get(attribute) ?? value;
            if (!attributes.has(item)) attributes.set(item, new Map());
            attributes.get(item)?.set(attribute, original);
            const translated = translateDemoText(original);
            if (translated !== value) item.setAttribute(attribute, translated);
          }
        }
      }
    }
    function observe() {
      for (const region of regions) observer.observe(region, {
        subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ["title", "aria-label", "placeholder"],
      });
    }
    apply();
    observe();
    return () => {
      observer.disconnect();
      for (const [node, original] of originals) {
        if (node.isConnected) node.textContent = original;
      }
      for (const [element, entries] of attributes) {
        if (element.isConnected) for (const [key, value] of entries) element.setAttribute(key, value);
      }
    };
  }, [locale]);

  return <div ref={root} className="contents">{children}</div>;
}
