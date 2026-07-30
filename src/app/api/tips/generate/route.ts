import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import type { TipReference, TipType } from "@/lib/tips";

type GenerateRequest = {
  bookTitle?: string;
  context?: {
    text?: string;
    chapterHref?: string;
    pageNumber?: number;
  };
};

type GeneratedTip = {
  type: TipType;
  title: string;
  body: string;
  anchorText: string;
  references: TipReference[];
};

const TIP_SCHEMA = {
  type: "object",
  properties: {
    tips: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "background",
              "controversy",
              "deep-dive",
              "connection",
              "fact-check",
            ],
          },
          title: { type: "string" },
          body: { type: "string" },
          anchorText: { type: "string" },
          references: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                url: { type: "string" },
              },
              required: ["label", "url"],
              additionalProperties: false,
            },
          },
        },
        required: ["type", "title", "body", "anchorText", "references"],
        additionalProperties: false,
      },
    },
  },
  required: ["tips"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You annotate books with "tip cards" — short, high-signal notes that surface supplemental context for a specific passage the reader is currently looking at.

Given the book title and a passage, produce 2 to 4 tip cards. Each card must be one of these types:
- background: historical context, or who/what something is
- controversy: competing theories, academic disputes, or contested claims
- deep-dive: a richer explanation of a concept mentioned in the passage
- connection: a link to another book, field, thinker, or idea
- fact-check: verifying, qualifying, or correcting a claim in the passage

Rules:
- Anchor each card to an exact verbatim phrase copied from the passage (the "anchorText"). It must appear in the passage word-for-word.
- Keep each "body" to 2-4 sentences. Be specific and substantive; no filler.
- Only include a card if you have genuine, accurate knowledge to add — never pad to reach a count.
- References are optional. Include a reference only when you are confident the source genuinely exists and is authoritative (e.g. a well-known encyclopedia, a landmark paper or book). When unsure, return an empty references array. Never invent URLs.
- Vary the card types when the passage supports it.`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Tip generation is not configured. Set ANTHROPIC_API_KEY (e.g. in Doppler).",
      },
      { status: 500 },
    );
  }

  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = body.context?.text?.trim();
  if (!text) {
    return NextResponse.json(
      { error: "No readable text on this page to generate tips from." },
      { status: 400 },
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: TIP_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `Book: ${body.bookTitle ?? "Untitled"}\n\nPassage:\n"""\n${text.slice(0, 6000)}\n"""`,
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The model declined to generate tips for this passage." },
        { status: 422 },
      );
    }

    const jsonText = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = JSON.parse(jsonText) as { tips: GeneratedTip[] };
    return NextResponse.json({ tips: parsed.tips ?? [] });
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : "Failed to generate tips.";
    return NextResponse.json({ error: messageText }, { status: 502 });
  }
}
