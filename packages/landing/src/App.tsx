import React from "react";
import Hero from "./components/Hero";
import HowItWorks from "./components/HowItWorks";
import Features from "./components/Features";
import Pricing from "./components/Pricing";
import Faq from "./components/Faq";
import Footer from "./components/Footer";
import Legal from "./pages/Legal";
import Support from "./pages/Support";
import NotFound from "./pages/NotFound";
import type { Route } from "./routes";

const App: React.FC<{ route: Route }> = ({ route }) => (
  <>
    {route.kind === "home" ? (
      <>
        <Hero />
        <HowItWorks />
        <Features />
        <Pricing />
        <Faq />
      </>
    ) : route.kind === "legal" ? (
      <Legal doc={route.doc} />
    ) : route.kind === "support" ? (
      <Support />
    ) : (
      <NotFound />
    )}
    <Footer />
  </>
);

export default App;
