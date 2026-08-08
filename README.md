# Document Genie

OmniParse AI — Phase 1–3



Build the first 3 phases of OmniParse AI, a premium AI Document Employee SaaS.



IMPORTANT:

Build on this specification carefully. Do not create fake features, placeholder functionality, or unfinished buttons. Keep the architecture clean and ready for future developers/AI tools to continue phases 4–9.



PHASE 1 — Foundation



Create a production-ready full-stack foundation with:



- Modern responsive SaaS UI

- Landing page

- Sign up / login / logout

- Secure authentication

- User profiles/settings

- Dashboard

- Database

- Protected routes

- Environment variables

- Clean scalable project structure



Create database architecture for:



Users

Documents

DocumentChunks

Workspaces

Conversations

Messages

Subscriptions

Usage



Users should have private data isolation.



Create the initial workspace system so users can organize documents.



Do not implement the full payment system yet, but make the database ready for subscriptions and usage tracking.



PHASE 2 — Document System



Build a real document processing system.



Support:



- PDF

- DOCX

- TXT

- Images/scanned documents



Implement:



- Drag-and-drop upload

- File validation

- File size/type limits

- Upload progress

- Secure storage

- Processing status

- Document metadata

- Delete documents

- Document viewer



Processing status:



Uploading → Processing → Ready / Failed



Extract text from documents and preserve useful structure such as pages, headings and sections where possible.



Create a modular processing/OCR service so another parser/OCR provider can be added later.



Do not expose private files or allow users to access another user's documents.



PHASE 3 — Gemini + AI Document Analyst



Integrate the Gemini API securely on the backend.



Never expose the Gemini API key in frontend code.



Create a modular AI service so another AI provider can be added later.



Build the AI Document Analyst.



Users should be able to:



- Chat with a document

- Ask questions

- Summarize

- Explain difficult sections

- Extract important information

- Find names, dates, numbers and key points

- Generate action items

- Analyze multiple documents when available



Use relevant document chunks/context instead of repeatedly sending entire documents to Gemini to reduce API costs.



Whenever possible, provide page/document references for answers.



If the information is not contained in the document, the AI should clearly say it cannot find it instead of inventing an answer.



Track:



- AI requests

- Token usage

- Document processing usage



Add proper loading states, errors, rate limiting and API failure handling.



UI



Make OmniParse feel like a premium business SaaS, NOT a generic ChatGPT clone.



Core dashboard:



- Upload document

- Recent documents

- Workspaces

- AI conversations

- Usage overview



Document page:



- Document preview

- AI chat

- Actions

- Processing status



Keep the interface mobile-friendly and polished.



IMPORTANT



Do NOT build phases 4–9 yet.



Do NOT add fake:



- Payments

- AI Employees

- Automations

- Team management

- Admin features



Those will be implemented later.



Make phases 1–3 fully functional and production-ready so another developer can continue from the same codebase.



Before finishing, test:



Authentication

Database

File uploads

Document processing

Permissions

Gemini API

AI chat

Usage tracking

Mobile responsiveness

Error handling



Fix errors and broken functionality before completing the phase.



The final result should be a working OmniParse AI foundation where a user can:



Sign up → upload a document → wait for processing → open it → ask Gemini questions → receive answers based on the document.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/20db5df8-948f-4acd-8d3d-07b9ff136ddd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
