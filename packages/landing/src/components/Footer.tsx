import React from "react";
import { appUrl } from "./Hero";
import { site } from "../site";

const Footer: React.FC = () => (
  <footer className="px-6 md:px-16 py-10 border-t border-white/10 text-sm text-gray-400 flex flex-wrap gap-x-6 gap-y-3">
    <span>© {new Date().getFullYear()} {site.name}</span>
    <a href={`${appUrl}/login`} className="hover:text-white">
      Log in
    </a>
    <a href="/#pricing" className="hover:text-white">
      Pricing
    </a>
    <a href="/support" className="hover:text-white">
      Support
    </a>
    <a href="/terms" className="hover:text-white">
      Terms
    </a>
    <a href="/privacy" className="hover:text-white">
      Privacy
    </a>
    <a href="/refunds" className="hover:text-white">
      Refunds
    </a>
    <a href="https://github.com/alfredoreduarte/timetrack" className="hover:text-white">
      GitHub
    </a>
  </footer>
);

export default Footer;
