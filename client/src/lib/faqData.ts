// FAQ content, shared by the FAQ page and the prerender script (which turns
// it into FAQPage structured data for search engines and AI agents).
// Answers are plain text; the page renders line breaks as paragraphs.
// House copy rule: no em dashes.

export interface FaqEntry {
  question: string;
  answer: string;
}

export const FAQ_ENTRIES: FaqEntry[] = [
  {
    question: "What is Tend?",
    answer:
      "Tend is a prayer-request app for churches. Your church gets one QR code and one prayer page. People scan the code, share a prayer request, and every request lands in one private inbox your care team can work from. Tend is operated by Mark Johnson Ventures LLC, and 100% of profits are donated to support orphans through Compassion International.",
  },
  {
    question: "How does Tend work?",
    answer:
      "A church signs up and Tend creates its QR code and prayer page right away. Print the QR code for the sanctuary, bulletins, pew cards, or the lobby. Anyone who scans it can share a prayer request, a check-in, a praise, or a question through a short web form, with their name or anonymously. Requests arrive in the church's inbox with status tracking: new, praying, prayed for, archived.",
  },
  {
    question: "How much does Tend cost?",
    answer:
      "The free plan is free forever, with no card required: one QR code and prayer page, with no limit on requests. The Church plan is one plan for every church at $49 per month, or $490 per year, with every feature included. It starts with a 30-day free trial, no card required, and can be cancelled anytime.",
  },
  {
    question: "Do people need an app or an account to share a prayer request?",
    answer:
      "No. The QR code opens a web page in the phone's browser. There is nothing to install and no account to create, which is why it works for visitors and guests, not only members.",
  },
  {
    question: "Who can see the prayer requests?",
    answer:
      "Only your church's signed-in care team. Requests are never posted publicly, never shared with other churches, and never sent to analytics or advertising tools. Congregants can also choose to share anonymously.",
  },
  {
    question: "Can people text a prayer request instead of scanning?",
    answer:
      "Yes. Churches on Tend can receive requests by text at their Tend number, and anyone can text a request to the main Tend line at (616) 816-4172. Texted requests land in the same inbox as QR requests. Message and data rates may apply, and anyone can reply STOP to opt out.",
  },
  {
    question: "What is a 24/7 prayer watch?",
    answer:
      "A prayer watch covers a full day in 96 fifteen-minute slots. Your church shares one sign-up page, people claim the slots they can cover, and the pastor dashboard shows coverage and the gaps that still need someone. Churches often run one watch before a big Sunday, a missions trip, or a season like the week before Thanksgiving.",
  },
  {
    question: "Can I gift Tend to my church?",
    answer:
      "Yes. Anyone can gift a full year of the Church plan to a church for one payment of $490, with no Tend account needed. The gift does not renew. The church's team is notified right away, and both the giver and the church are emailed when the gift year ends.",
  },
  {
    question: "Does Tend work with Planning Center?",
    answer:
      "Yes. Tend can sync prayer requests into Planning Center, so a church that already runs on Planning Center can keep its existing workflow while collecting requests the easy way.",
  },
  {
    question: "Who can set Tend up for our church?",
    answer:
      "Anyone on the team. Setup takes a few minutes: sign up with a phone number or email, name your church, and your QR code and prayer page are ready to print. You do not need the pastor, an IT person, or a credit card to start.",
  },
];
