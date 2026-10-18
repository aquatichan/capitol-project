import { Component } from "react";

// Keeps one broken widget (the assistant, a PDF button) from blanking the whole page.
export default class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error("GridAid:", error); }
  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
