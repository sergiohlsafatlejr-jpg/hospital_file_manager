'use strict';
// Host DOM deliberadamente mínimo: testes ReactDOM offline, não um browser.
function createSyntheticDom() {
  let document;
  class SyntheticEvent {
    constructor(type, options = {}) {
      Object.assign(this, { type, bubbles: true, cancelable: true, defaultPrevented: false }, options);
    }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    stopPropagation() { this.cancelBubble = true; }
  }
  class Node {
    constructor(type, name, owner) {
      this.nodeType = type; this.nodeName = name; this.ownerDocument = owner;
      this.childNodes = []; this.parentNode = null; this.listeners = {};
    }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes.at(-1) || null; }
    get nextSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) + 1] || null; }
    get previousSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) - 1] || null; }
    appendChild(node) { if (node.parentNode) node.parentNode.removeChild(node); this.childNodes.push(node); node.parentNode = this; return node; }
    removeChild(node) { this.childNodes.splice(this.childNodes.indexOf(node), 1); node.parentNode = null; return node; }
    insertBefore(node, before) {
      if (!before) return this.appendChild(node);
      if (node.parentNode) node.parentNode.removeChild(node);
      this.childNodes.splice(this.childNodes.indexOf(before), 0, node); node.parentNode = this; return node;
    }
    get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map(n => n.textContent).join(''); }
    set textContent(value) {
      if (this.nodeType === 3) { this.nodeValue = String(value); return; }
      this.childNodes.forEach(n => { n.parentNode = null; }); this.childNodes = [];
      if (value) this.appendChild(this.ownerDocument.createTextNode(String(value)));
    }
    contains(node) { return node === this || this.childNodes.some(child => child.contains(node)); }
    addEventListener(type, fn, options) {
      (this.listeners[type] ||= []).push({ fn, capture: options === true || !!options?.capture });
    }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(x => x.fn !== fn); }
    dispatchEvent(event) {
      event.target = this;
      const route = []; for (let node = this; node; node = node.parentNode) route.push(node);
      for (const capture of [true, false]) {
        for (const node of capture ? [...route].reverse() : route) {
          event.currentTarget = node;
          for (const listener of node.listeners[event.type] || []) if (listener.capture === capture) listener.fn.call(node, event);
          if (event.cancelBubble || (!capture && !event.bubbles)) break;
        }
        if (event.cancelBubble) break;
      }
      return !event.defaultPrevented;
    }
  }
  class Element extends Node {
    constructor(name, owner, namespace = 'http://www.w3.org/1999/xhtml') {
      super(1, name.toUpperCase(), owner); this.tagName = this.nodeName;
      this.localName = name; this.namespaceURI = namespace; this.attributes = {};
      this.style = { setProperty(name, value) { this[name] = String(value); } };
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    setAttributeNS(_ns, name, value) { this.setAttribute(name, value); }
    removeAttribute(name) { delete this.attributes[name]; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    hasAttribute(name) { return name in this.attributes; }
    get tabIndex() { return this.hasAttribute('tabindex') ? Number(this.getAttribute('tabindex')) : this.tagName === 'BUTTON' ? 0 : -1; }
    get disabled() { return this.hasAttribute('disabled'); }
    focus() { document.activeElement = this; this.dispatchEvent(new SyntheticEvent('focusin')); }
    blur() { document.activeElement = document.body; this.dispatchEvent(new SyntheticEvent('focusout')); }
    click() { if (!this.disabled) this.dispatchEvent(new SyntheticEvent('click', { button: 0 })); }
  }
  document = new Node(9, '#document', null);
  document.ownerDocument = document;
  document.createElement = name => new Element(name, document);
  document.createElementNS = (ns, name) => new Element(name, document, ns);
  document.createTextNode = value => { const node = new Node(3, '#text', document); node.nodeValue = value; return node; };
  document.documentElement = document.createElement('html');
  document.body = document.createElement('body');
  document.appendChild(document.documentElement); document.documentElement.appendChild(document.body);
  document.activeElement = document.body;
  const window = {
    document, Node, Element, HTMLElement: Element, HTMLIFrameElement: class extends Element {},
    Event: SyntheticEvent, KeyboardEvent: SyntheticEvent,
    navigator: { userAgent: 'offline-synthetic-dom' }, location: { protocol: 'about:' },
    addEventListener() {}, removeEventListener() {},
    getComputedStyle: element => element.style,
  };
  window.window = window; document.defaultView = window;
  const all = (node = document.body, tag) => {
    const values = []; function visit(n) { if (!tag || n.tagName === tag.toUpperCase()) values.push(n); n.childNodes.forEach(visit); }
    visit(node); return values;
  };
  // Simula a ação padrão do agente DOM. O keydown sempre atravessa os
  // listeners reais instalados por React; Enter/Espaço em button geram click.
  const press = (key, options = {}) => {
    const target = document.activeElement;
    const event = new SyntheticEvent('keydown', { key, ...options });
    target.dispatchEvent(event);
    if (!event.defaultPrevented && key === 'Tab') {
      const focusable = all().filter(n => n.nodeType === 1 && n.tabIndex >= 0 && !n.disabled);
      const index = focusable.indexOf(target);
      focusable[(index + (options.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus();
    }
    target.dispatchEvent(new SyntheticEvent('keyup', { key, ...options }));
    if (!event.defaultPrevented && !options.repeat && target.tagName === 'BUTTON' && (key === 'Enter' || key === ' ')) target.click();
    return event;
  };
  return { document, window, all, press, SyntheticEvent };
}
module.exports = { createSyntheticDom };
