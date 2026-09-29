let installed = false;

const REACT_ROOT_SELECTOR = "#root, #portal-root";

const getElement = (node) => {
  if (!node) return null;
  if (node.nodeType === Node.ELEMENT_NODE) return node;
  return node.parentElement || null;
};

const isInsideReactRoot = (node) => {
  const element = getElement(node);
  return Boolean(element?.closest?.(REACT_ROOT_SELECTOR));
};

export const markReactRootsAsNoTranslate = () => {
  if (typeof document === "undefined") return;

  document.documentElement.setAttribute("translate", "no");
  document.documentElement.classList.add("notranslate");
  document.body?.setAttribute("translate", "no");
  document.body?.classList.add("notranslate");

  document.querySelectorAll(REACT_ROOT_SELECTOR).forEach((root) => {
    root.setAttribute("translate", "no");
    root.classList.add("notranslate");
  });
};

export const installDomTranslationGuard = () => {
  if (
    installed ||
    typeof window === "undefined" ||
    typeof Node === "undefined"
  ) {
    return;
  }

  installed = true;
  markReactRootsAsNoTranslate();

  const nativeRemoveChild = Node.prototype.removeChild;
  const nativeInsertBefore = Node.prototype.insertBefore;

  Node.prototype.removeChild = function guardedRemoveChild(child) {
    if (
      child &&
      child.parentNode !== this &&
      (isInsideReactRoot(this) || isInsideReactRoot(child))
    ) {
      if (child.parentNode) {
        try {
          return nativeRemoveChild.call(child.parentNode, child);
        } catch {
          return child;
        }
      }
      return child;
    }

    return nativeRemoveChild.call(this, child);
  };

  Node.prototype.insertBefore = function guardedInsertBefore(
    newNode,
    referenceNode,
  ) {
    if (
      referenceNode &&
      referenceNode.parentNode !== this &&
      (isInsideReactRoot(this) || isInsideReactRoot(referenceNode))
    ) {
      return this.appendChild(newNode);
    }

    return nativeInsertBefore.call(this, newNode, referenceNode);
  };
};
