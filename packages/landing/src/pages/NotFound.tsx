import React from "react";
import Page from "./Page";

const NotFound: React.FC = () => (
  <Page title="Page not found">
    <p className="text-gray-100/90">
      There's nothing here. Head back <a href="/" className="text-neon-purple underline underline-offset-4 hover:text-white">home</a>.
    </p>
  </Page>
);

export default NotFound;
