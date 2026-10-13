# APEX / EIC templates (reference)

Reference copies of the Events Industry Council APEX templates the ESG and Post-Event Report features are modeled on, from https://insights.eventscouncil.org/Full-Article/events-industry-council-templates. © Convention Industry Council (now Events Industry Council). Kept for internal reference only. Field labels in `src/lib/esg/` are short paraphrases, not copies of the template instruction text.

| File | Used by |
|---|---|
| `APEX_Event_Specifications_Guide.pdf` | ESG Part I: `src/lib/esg/fields.ts`, `/events/[id]/specifications` |
| `APEX_Function_Schedule.pdf` | ESG Part II: Function Schedule |
| `APEX_Function_Set-Up_Order_with_exhibits.pdf` | ESG Part IIIa/IIIb: set-up orders and booth set-up orders (`/events/[id]/exhibits`) |
| `APEX_Post_Event_Report.pdf` | PER: `src/lib/esg/perFields.ts`, `/events/[id]/post-event` |
| `APEX_Housing_Registration.pdf` | Input for the upcoming Hotels module (`src/lib/esg/housing.ts` seam) |
| `APEX_Single_Facility_RFP.pdf` | Input for the upcoming Hotels module (RFP / proposals) |

Exports: the ESG and PER reports render on screen, as Print / Save PDF, and as `.docx` / `.xlsx` downloads (`src/app/api/events/[id]/esg/route.ts`).
