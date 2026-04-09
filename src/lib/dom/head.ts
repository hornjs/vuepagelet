import { inject, onUnmounted, type InjectionKey } from "vue";

const HEAD_MARKER_ATTR = "data-vuepagelet-head";

export interface HeadAttributes {
  [key: string]: string | number | boolean | null | undefined;
}

export interface HeadMetaDescriptor extends HeadAttributes {}
export interface HeadLinkDescriptor extends HeadAttributes {}

export interface HeadStyleDescriptor extends HeadAttributes {
  children?: string;
}

export interface HeadScriptDescriptor extends HeadAttributes {
  children?: string;
}

export interface HeadInput {
  title?: string | null | undefined;
  meta?: readonly HeadMetaDescriptor[] | null | undefined;
  link?: readonly HeadLinkDescriptor[] | null | undefined;
  style?: readonly HeadStyleDescriptor[] | null | undefined;
  script?: readonly HeadScriptDescriptor[] | null | undefined;
  htmlAttrs?: HeadAttributes | null | undefined;
  bodyAttrs?: HeadAttributes | null | undefined;
}

export interface HeadSnapshot {
  title?: string;
  meta: HeadMetaDescriptor[];
  link: HeadLinkDescriptor[];
  style: HeadStyleDescriptor[];
  script: HeadScriptDescriptor[];
  htmlAttrs: HeadAttributes;
  bodyAttrs: HeadAttributes;
}

export interface HeadManager {
  setEntry(key: symbol, input: HeadInput): void;
  deleteEntry(key: symbol): void;
  snapshot(): HeadSnapshot;
  connectDocument(target: Document): void;
  disconnectDocument(): void;
}

export interface HeadUpdateHandle {
  dispose(): void;
  update(next: HeadInput): void;
}

export const headManagerKey: InjectionKey<HeadManager> = Symbol("vuepagelet-head-manager");

export function createHeadManager(): HeadManager {
  const entries = new Map<symbol, HeadInput>();
  const appliedHtmlAttrs = new Set<string>();
  const appliedBodyAttrs = new Set<string>();
  let targetDocument: Document | undefined;

  const syncDocument = () => {
    if (!targetDocument) {
      return;
    }

    applyHeadSnapshotToDocument(targetDocument, resolveHeadSnapshot(entries.values()), {
      appliedHtmlAttrs,
      appliedBodyAttrs,
    });
  };

  return {
    setEntry(key, input) {
      entries.set(key, normalizeHeadInput(input));
      syncDocument();
    },
    deleteEntry(key) {
      entries.delete(key);
      syncDocument();
    },
    snapshot() {
      return resolveHeadSnapshot(entries.values());
    },
    connectDocument(target) {
      targetDocument = target;
      syncDocument();
    },
    disconnectDocument() {
      targetDocument = undefined;
    },
  };
}

export function injectHeadSnapshotIntoHtml(html: string, snapshot: HeadSnapshot): string {
  let next = mergeTagAttributes(html, "html", snapshot.htmlAttrs);
  next = mergeTagAttributes(next, "body", snapshot.bodyAttrs);

  const headTags = serializeHeadTags(snapshot);
  if (!headTags) {
    return next;
  }

  return next.replace(/<head([^>]*)>([\s\S]*?)<\/head>/i, (_match, attrs, content) => {
    const withoutTitle = snapshot.title
      ? String(content).replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, "")
      : String(content);

    return `<head${String(attrs)}>${withoutTitle}${headTags}</head>`;
  });
}

export function updateHead(input: HeadInput): HeadUpdateHandle {
  const manager = useHeadManager();
  const key = Symbol("vuepagelet-head-update");

  const apply = (next: HeadInput) => {
    manager.setEntry(key, next);
  };
  const dispose = () => {
    manager.deleteEntry(key);
  };

  apply(input);
  onUnmounted(dispose);

  return {
    dispose,
    update: apply,
  };
}

export function useHeadManager(): HeadManager {
  const manager = inject(headManagerKey, null);

  if (!manager) {
    throw new Error("vuepagelet head manager is not available in the current app context");
  }

  return manager;
}

function resolveHeadSnapshot(entries: Iterable<HeadInput>): HeadSnapshot {
  const snapshot: HeadSnapshot = {
    meta: [],
    link: [],
    style: [],
    script: [],
    htmlAttrs: {},
    bodyAttrs: {},
  };

  for (const entry of entries) {
    if (typeof entry.title === "string") {
      snapshot.title = entry.title;
    }

    if (entry.meta?.length) {
      snapshot.meta.push(...entry.meta);
    }

    if (entry.link?.length) {
      snapshot.link.push(...entry.link);
    }

    if (entry.style?.length) {
      snapshot.style.push(...entry.style);
    }

    if (entry.script?.length) {
      snapshot.script.push(...entry.script);
    }

    Object.assign(snapshot.htmlAttrs, entry.htmlAttrs);
    Object.assign(snapshot.bodyAttrs, entry.bodyAttrs);
  }

  return snapshot;
}

function normalizeHeadInput(input: HeadInput): HeadInput {
  return {
    title: typeof input.title === "string" ? input.title : undefined,
    meta: normalizeDescriptorArray(input.meta),
    link: normalizeDescriptorArray(input.link),
    style: normalizeDescriptorArray(input.style),
    script: normalizeDescriptorArray(input.script),
    htmlAttrs: normalizeAttributes(input.htmlAttrs),
    bodyAttrs: normalizeAttributes(input.bodyAttrs),
  };
}

function normalizeDescriptorArray<T extends HeadAttributes>(
  input: readonly T[] | null | undefined,
): T[] {
  if (!input?.length) {
    return [];
  }

  return input.map((entry) => normalizeAttributes(entry) as T);
}

function normalizeAttributes(input: HeadAttributes | null | undefined): HeadAttributes {
  const next: HeadAttributes = {};
  if (!input) {
    return next;
  }

  for (const [key, value] of Object.entries(input)) {
    if (value == null || value === false) {
      continue;
    }

    next[key] = value;
  }

  return next;
}

function applyHeadSnapshotToDocument(
  target: Document,
  snapshot: HeadSnapshot,
  state: {
    appliedHtmlAttrs: Set<string>;
    appliedBodyAttrs: Set<string>;
  },
): void {
  for (const node of target.head.querySelectorAll(`[${HEAD_MARKER_ATTR}="true"]:not(title)`)) {
    node.parentNode?.removeChild(node);
  }

  syncManagedAttributes(target.documentElement, snapshot.htmlAttrs, state.appliedHtmlAttrs);
  syncManagedAttributes(target.body, snapshot.bodyAttrs, state.appliedBodyAttrs);

  syncDocumentTitle(target, snapshot.title);

  for (const element of createHeadElements(target, snapshot)) {
    target.head.appendChild(element);
  }
}

function syncDocumentTitle(target: Document, nextTitle: string | undefined): void {
  if (typeof nextTitle !== "string") {
    return;
  }

  target.title = nextTitle;
  const titleElement = target.head.querySelector("title") ?? target.createElement("title");
  titleElement.textContent = nextTitle;

  if (!titleElement.parentNode) {
    target.head.prepend(titleElement);
  }
}

function syncManagedAttributes(
  element: Element,
  nextAttrs: HeadAttributes,
  previousKeys: Set<string>,
): void {
  for (const key of [...previousKeys]) {
    if (!(key in nextAttrs)) {
      element.removeAttribute(key);
      previousKeys.delete(key);
    }
  }

  for (const [key, value] of Object.entries(nextAttrs)) {
    if (value == null || value === false) {
      continue;
    }

    applyAttribute(element, key, value);
    previousKeys.add(key);
  }
}

function createHeadElements(target: Document, snapshot: HeadSnapshot): Element[] {
  const nodes: Element[] = [];

  for (const descriptor of snapshot.meta) {
    nodes.push(createElementWithAttributes(target, "meta", descriptor));
  }

  for (const descriptor of snapshot.link) {
    nodes.push(createElementWithAttributes(target, "link", descriptor));
  }

  for (const descriptor of snapshot.style) {
    nodes.push(createElementWithAttributes(target, "style", descriptor));
  }

  for (const descriptor of snapshot.script) {
    nodes.push(createElementWithAttributes(target, "script", descriptor));
  }

  return nodes;
}

function createElementWithAttributes(
  target: Document,
  tagName: "meta" | "link" | "style" | "script",
  descriptor: HeadAttributes,
): Element {
  const element = target.createElement(tagName);
  element.setAttribute(HEAD_MARKER_ATTR, "true");

  for (const [key, value] of Object.entries(descriptor)) {
    if (key === "children") {
      element.textContent = String(value);
      continue;
    }

    if (value == null || value === false) {
      continue;
    }

    applyAttribute(element, key, value);
  }

  return element;
}

function applyAttribute(element: Element, key: string, value: string | number | boolean): void {
  if (value === true) {
    element.setAttribute(key, "");
    return;
  }

  element.setAttribute(key, String(value));
}

function mergeTagAttributes(html: string, tagName: "html" | "body", attrs: HeadAttributes): string {
  if (Object.keys(attrs).length === 0) {
    return html;
  }

  const pattern = new RegExp(`<${tagName}([^>]*)>`, "i");

  return html.replace(pattern, (_match, rawAttributes) => {
    const merged = mergeAttributeString(String(rawAttributes), attrs);
    return `<${tagName}${merged}>`;
  });
}

function mergeAttributeString(existing: string, attrs: HeadAttributes): string {
  let next = existing;

  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) {
      continue;
    }

    const serialized = serializeAttribute(key, value);
    const pattern = new RegExp(`\\s${escapeRegExp(key)}(?:="[^"]*")?`, "i");

    if (pattern.test(next)) {
      next = next.replace(pattern, serialized);
      continue;
    }

    next += serialized;
  }

  return next;
}

function serializeHeadTags(snapshot: HeadSnapshot): string {
  const parts: string[] = [];

  if (snapshot.title) {
    parts.push(
      `<title ${HEAD_MARKER_ATTR}="true">${escapeHtml(snapshot.title)}</title>`,
    );
  }

  for (const descriptor of snapshot.meta) {
    parts.push(`<meta ${HEAD_MARKER_ATTR}="true"${serializeAttributes(descriptor)}>`);
  }

  for (const descriptor of snapshot.link) {
    parts.push(`<link ${HEAD_MARKER_ATTR}="true"${serializeAttributes(descriptor)}>`);
  }

  for (const descriptor of snapshot.style) {
    const { children = "", ...attrs } = descriptor;
    parts.push(
      `<style ${HEAD_MARKER_ATTR}="true"${serializeAttributes(attrs)}>${sanitizeStyleText(
        String(children),
      )}</style>`,
    );
  }

  for (const descriptor of snapshot.script) {
    const { children = "", ...attrs } = descriptor;
    parts.push(
      `<script ${HEAD_MARKER_ATTR}="true"${serializeAttributes(attrs)}>${sanitizeScriptText(
        String(children),
      )}</script>`,
    );
  }

  return parts.join("");
}

function serializeAttributes(input: HeadAttributes): string {
  return Object.entries(input)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => serializeAttribute(key, value))
    .join("");
}

function serializeAttribute(
  key: string,
  value: string | number | boolean | null | undefined,
): string {
  if (value == null || value === false) {
    return "";
  }

  if (value === true) {
    return ` ${key}`;
  }

  return ` ${key}="${escapeHtml(String(value))}"`;
}

function sanitizeStyleText(value: string): string {
  return value.replace(/<\/style/gi, "<\\/style");
}

function sanitizeScriptText(value: string): string {
  return value.replace(/<\/script/gi, "<\\/script").replace(/</g, "\\u003c");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
