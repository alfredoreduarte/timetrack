import React from "react";
import Page from "./Page";
import { site } from "../site";

const Support: React.FC = () => (
  <Page title="Support">
    <div className="space-y-6 text-gray-100/90 leading-relaxed">
      {site.supportEmail ? (
        <p>
          Write to{" "}
          <a href={`mailto:${site.supportEmail}`} className="text-neon-purple underline underline-offset-4 hover:text-white">
            {site.supportEmail}
          </a>{" "}
          for help, billing, refunds and privacy requests. We answer within two business days.
        </p>
      ) : null}
      {site.githubIssues ? (
        <p>
          Found a bug or want a feature? Open an issue on{" "}
          <a href={site.githubIssues} className="text-neon-purple underline underline-offset-4 hover:text-white">
            GitHub
          </a>
          {site.supportEmail ? "." : ". Please don't post account, billing or personal details there: issues are public."}
        </p>
      ) : null}
      <p>
        You can manage most things yourself: cancel or change your plan from <strong className="text-white">Billing</strong>,
        and export your timesheets or delete your account from <strong className="text-white">Settings</strong>.
      </p>
      <p>
        See also our <a href="/terms" className="text-neon-purple underline underline-offset-4 hover:text-white">Terms</a>,{" "}
        <a href="/privacy" className="text-neon-purple underline underline-offset-4 hover:text-white">Privacy Policy</a> and{" "}
        <a href="/refunds" className="text-neon-purple underline underline-offset-4 hover:text-white">Refund &amp; Cancellation Policy</a>.
      </p>
    </div>
  </Page>
);

export default Support;
