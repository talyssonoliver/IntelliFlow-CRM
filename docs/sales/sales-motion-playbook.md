# Sales Motion Playbook

## Overview

This playbook defines the sales methodology, qualification framework, and motion for IntelliFlow CRM. It provides a structured approach to moving prospects through the sales pipeline with consistency and predictability.

**Version**: 1.0
**Last Updated**: 2025-12-22
**Owner**: Sales Team

---

## Lead Sources

### 1. Inbound Leads

**Channels**:
- Website form submissions (Contact Us, Demo Request)
- Content downloads (whitepapers, case studies, ebooks)
- Webinar registrations and attendees
- Free trial signups
- Chat conversations (website chat widget)
- SEO organic search traffic
- Social media engagement (LinkedIn, Twitter)

**Qualification Priority**: High
**Response SLA**: < 1 hour during business hours
**Routing**: Auto-assigned via round-robin to available AEs

**Key Actions**:
- Respond within 1 hour
- Qualify using MEDDIC framework
- Schedule discovery call within 24 hours
- Log all interactions in CRM

---

### 2. Outbound Leads

**Channels**:
- Cold email campaigns (targeted lists)
- LinkedIn outreach (Sales Navigator)
- Cold calling (phone prospecting)
- Account-based marketing (ABM) campaigns
- Conference attendee follow-ups
- Industry event networking

**Qualification Priority**: Medium
**Response SLA**: Initial contact within 24 hours
**Routing**: Assigned to SDR team, qualified leads passed to AEs

**Key Actions**:
- Research account before outreach
- Personalize messaging based on pain points
- Multi-touch sequences (email + phone + LinkedIn)
- Track engagement metrics (opens, clicks, replies)
- Qualify before passing to AE

**Outbound Cadence**:
- Day 1: Email #1 (problem awareness)
- Day 3: LinkedIn connection request
- Day 5: Phone call attempt #1
- Day 7: Email #2 (value proposition)
- Day 10: Phone call attempt #2
- Day 14: Email #3 (case study/social proof)
- Day 21: Break-up email (last attempt)

---

### 3. Referrals

**Channels**:
- Customer referrals (existing users)
- Partner referrals (integration partners, agencies)
- Employee referrals (team network)
- Investor/advisor referrals

**Qualification Priority**: Very High
**Response SLA**: < 30 minutes
**Routing**: Direct to senior AE or Sales Manager

**Key Actions**:
- Thank referrer immediately
- Fast-track to discovery call
- Leverage referrer's credibility in conversation
- Close loop with referrer on outcome
- Track referral source in CRM

**Referral Incentives**:
- Customer referrals: 10% account credit or $500
- Partner referrals: Revenue share agreement
- Employee referrals: $1,000 bonus on closed deal

---

### 4. Partner Channel

**Channels**:
- Technology partners (integrations)
- Consulting/implementation partners
- Resellers and distributors
- Affiliate partnerships
- Co-marketing partnerships

**Qualification Priority**: High
**Response SLA**: < 2 hours
**Routing**: Assigned to Partner Account Manager

**Key Actions**:
- Coordinate with partner on approach
- Respect partner relationship
- Provide partner with enablement materials
- Joint discovery calls when appropriate
- Track partner attribution in CRM

**Partner Engagement Model**:
- Referral partners: Lead pass, we close
- Resellers: Partner closes, we support
- Co-sell: Joint sales motion, shared revenue

---

## MEDDIC Qualification Framework

MEDDIC is our standard qualification methodology. Every opportunity must have all six elements documented before advancing to Demo stage.

### M - Metrics

**What success looks like for the customer**

**Key Questions**:
- What are your current key performance indicators?
- What metrics are you trying to improve?
- What is the quantifiable impact of the problem you're facing?
- What ROI do you expect from a solution?
- How will you measure success?

**Documentation Requirements**:
- Current state metrics (baseline)
- Desired state metrics (target)
- Time frame for improvement
- Financial impact (cost savings, revenue increase)

**Example Metrics**:
- "Reduce lead response time from 4 hours to 15 minutes"
- "Increase lead conversion rate from 15% to 25%"
- "Save 10 hours/week on manual data entry"
- "Improve forecast accuracy from 60% to 85%"

**CRM Field**: `metrics` (JSON field with current/target/timeframe)

---

### E - Economic Buyer

**The person with budget authority and final decision power**

**Key Questions**:
- Who controls the budget for this purchase?
- Who has to approve this expenditure?
- Have you spoken with them about this project?
- What are their priorities this quarter/year?
- When can we meet with them?

**Identification Criteria**:
- Has profit/loss responsibility
- Controls departmental or company budget
- Can sign contracts without escalation
- Typically VP-level or C-suite

**Engagement Strategy**:
- Get introduced early (by Champion)
- Understand their strategic priorities
- Speak to business outcomes, not features
- Address their concerns about risk/change

**CRM Field**: `economic_buyer_id` (Contact record with role = "Economic Buyer")

**Red Flags**:
- Can't identify who controls budget
- Economic Buyer not engaged by Demo stage
- Stakeholders avoid introducing you to EB
- Budget "should be available" but unconfirmed

---

### D - Decision Criteria

**The factors used to evaluate and compare solutions**

**Key Questions**:
- What criteria will you use to evaluate solutions?
- How will you rank/weight these criteria?
- Are there must-have requirements?
- What would disqualify a vendor?
- How do you compare us to alternatives?

**Common Decision Criteria**:
- **Functional**: Features, integrations, ease of use
- **Technical**: Security, scalability, performance, API
- **Financial**: Price, ROI, total cost of ownership
- **Vendor**: Company stability, support, references
- **Implementation**: Time to value, migration effort, training

**Documentation Requirements**:
- Written list of criteria with weights
- Must-have vs. nice-to-have separation
- Competitive evaluation matrix (if comparing vendors)

**CRM Field**: `decision_criteria` (JSON array with criterion + weight + status)

**Discovery Questions**:
- "Walk me through how you'll decide between vendors"
- "What makes a solution a 'no' for you?"
- "How are you weighting features vs. price vs. support?"

---

### D - Decision Process

**The steps and timeline for making the purchase decision**

**Key Questions**:
- What is your timeline for making a decision?
- Who is involved in the decision-making process?
- What steps are required before purchase?
- Have you done this type of purchase before?
- What could delay the decision?

**Typical B2B Decision Process**:
1. **Problem identification** (stakeholder identifies need)
2. **Solution research** (evaluate options)
3. **Vendor evaluation** (demos, trials, POCs)
4. **Internal consensus** (stakeholder alignment)
5. **Business case creation** (ROI analysis)
6. **Procurement review** (legal, security, compliance)
7. **Contract negotiation** (terms, pricing)
8. **Final approval** (Economic Buyer signs)

**Documentation Requirements**:
- Decision timeline with milestones
- List of decision-making stakeholders and roles
- Approval process steps
- Potential blockers or delays
- Past buying behavior (if available)

**CRM Fields**:
- `decision_timeline` (date field)
- `decision_process_stages` (JSON array)
- `stakeholders` (related Contact records)

**Red Flags**:
- Vague timeline ("sometime next quarter")
- No defined process ("we'll figure it out")
- New type of purchase for organization
- Unidentified stakeholders appearing late

---

### I - Identify Pain

**The core business problem driving the purchase**

**Key Questions**:
- What problem are you trying to solve?
- What is the impact if you don't solve it?
- Why is this a priority now?
- What have you tried before?
- What happens if you do nothing?

**Pain Categories**:
- **Operational**: Inefficiency, manual processes, errors
- **Financial**: Revenue loss, cost overruns, wasted spend
- **Strategic**: Competitive disadvantage, market changes
- **Compliance**: Regulatory risk, audit failures
- **Growth**: Scaling limitations, capacity constraints

**Pain Qualification**:
- **Critical**: Must solve or business at risk (urgent)
- **Important**: Significant impact but not urgent
- **Nice to solve**: Minor improvement, low priority

**Documentation Requirements**:
- Primary pain point description
- Impact quantification (metrics)
- Urgency level (why now?)
- Previous attempts to solve
- Cost of inaction

**CRM Field**: `identified_pain` (text field + pain_severity enum)

**Discovery Framework**:
1. **Situation**: Understand current state
2. **Problem**: Identify challenges
3. **Implication**: Explore consequences
4. **Need-Payoff**: Envision solution benefits

**Example Pains**:
- "Our sales team spends 15 hours/week on data entry instead of selling"
- "We lose 30% of inbound leads due to slow response times"
- "Lack of pipeline visibility makes forecasting impossible"
- "Manual processes can't scale as we grow from 20 to 50 reps"

---

### C - Champion

**An internal advocate who sells on your behalf**

**Key Questions**:
- Who internally believes in this solution?
- Who will advocate for us when we're not in the room?
- What's in it for them personally?
- Do they have influence with the Economic Buyer?
- Will they share internal information with us?

**Champion Characteristics**:
- **Has power**: Influence with Economic Buyer and stakeholders
- **Has credibility**: Respected internally, track record of success
- **Accessible**: Willing to meet, respond, share information
- **Sells for you**: Advocates in internal meetings without you
- **Benefits personally**: Career growth, problem solved, recognition

**Champion Development**:
1. **Identify**: Find someone with power, pain, and vision
2. **Align**: Understand their personal goals and motivations
3. **Equip**: Provide materials, business case, talking points
4. **Validate**: Test if they'll sell for you internally
5. **Leverage**: Use them to navigate politics and access EB

**Documentation Requirements**:
- Champion contact details and role
- Their personal win from this purchase
- Influence map (relationship to stakeholders)
- Internal selling actions they've taken

**CRM Field**: `champion_id` (Contact record with role = "Champion")

**Red Flags**:
- No clear champion identified
- "Champion" has no influence or credibility
- Champion won't introduce you to Economic Buyer
- Champion not engaged by Proposal stage
- Relying solely on external coach, not internal advocate

**Champion vs. Coach**:
- **Champion**: Internal, has power, sells for you
- **Coach**: Internal or external, provides guidance, may lack power

---

## Sales Stages

Our sales pipeline follows a structured progression with clear exit criteria and probability assignments. Each stage requires specific MEDDIC elements to be documented.

| Stage | Probability | Exit Criteria | Required MEDDIC | Avg. Duration |
|-------|-------------|---------------|-----------------|---------------|
| **Discovery** | 10% | - Initial call completed<br>- Pain identified and documented<br>- Stakeholders mapped<br>- Next steps scheduled | I (Identify Pain) | 1-2 weeks |
| **Qualification** | 25% | - All MEDDIC elements documented<br>- Economic Buyer identified<br>- Budget confirmed or path to budget<br>- Timeline established<br>- Demo scheduled | M, E, D, D, I, C | 2-3 weeks |
| **Demo** | 50% | - Demo delivered to key stakeholders<br>- Value proposition resonates<br>- Technical requirements confirmed<br>- Champion actively engaged<br>- Proposal requested | All MEDDIC validated | 1-2 weeks |
| **Proposal** | 75% | - Proposal delivered and reviewed<br>- Pricing accepted in principle<br>- Economic Buyer engaged<br>- Verbal commitment to move forward<br>- Legal/procurement engaged | All MEDDIC + EB meeting | 2-4 weeks |
| **Negotiation** | 90% | - Contracts in legal review<br>- Final pricing agreed<br>- Implementation plan approved<br>- All stakeholders aligned<br>- Close date confirmed | All MEDDIC + contract sent | 1-3 weeks |
| **Closed Won** | 100% | - Contract signed<br>- Payment received or PO issued<br>- Implementation kickoff scheduled<br>- Handoff to CS complete | N/A | N/A |

### Stage Progression Rules

**Discovery → Qualification**:
- Must identify at least one critical pain
- Must have multiple stakeholders engaged
- Must have clear next steps (not "keep in touch")

**Qualification → Demo**:
- All six MEDDIC elements documented
- Economic Buyer identified by name and title
- Budget conversation initiated
- Timeline within 90 days

**Demo → Proposal**:
- Demo delivered to 3+ stakeholders
- Champion actively selling internally
- Economic Buyer acknowledges value
- Formal proposal requested

**Proposal → Negotiation**:
- Proposal reviewed with Economic Buyer
- Pricing within acceptable range
- No deal-breaker objections
- Legal/procurement contacts identified

**Negotiation → Closed Won**:
- All redlines addressed
- Final approvals obtained
- Purchase order or signed contract
- Payment terms agreed

---

## Sales Velocity Metrics

**Key Performance Indicators**:

- **Average Deal Size**: $25,000 - $75,000 (mid-market)
- **Sales Cycle Length**: 45-90 days (Discovery to Closed Won)
- **Win Rate**: 25-30% (Qualification to Closed Won)
- **Stage Conversion Rates**:
  - Discovery → Qualification: 50%
  - Qualification → Demo: 70%
  - Demo → Proposal: 60%
  - Proposal → Negotiation: 80%
  - Negotiation → Closed Won: 85%

**Pipeline Health**:
- 3x pipeline coverage (pipeline value = 3x quota)
- No deal >90 days without stage progression
- Weekly pipeline review with Manager
- Quarterly MEDDIC audit (random sample)

---

## Objection Handling

### Common Objections & Responses

**"We're happy with our current CRM"**
- Response: "That's great to hear. What I'm curious about is [specific pain from discovery]. How is your current CRM addressing that?"
- Follow-up: "What would it take for you to consider a change?"

**"It's too expensive"**
- Response: "I understand budget is always a consideration. Let's break down the ROI. You mentioned [pain costs X per month]. Our solution pays for itself in [Y months]. Does that math work for your team?"
- Follow-up: "What budget were you expecting?"

**"We need to talk to other vendors"**
- Response: "Absolutely, that's a smart approach. To help you evaluate effectively, what criteria will you use to compare vendors?"
- Follow-up: "How can we ensure we're positioned well in that evaluation?"

**"Now isn't the right time"**
- Response: "I get it, timing matters. Help me understand - what needs to happen before the timing is right?"
- Follow-up: "What's the cost of waiting another quarter/year?"

**"I need to get buy-in from [stakeholder]"**
- Response: "That makes sense. What are [stakeholder]'s main concerns likely to be?"
- Follow-up: "Would it be helpful if I joined that conversation to address questions directly?"

**"We'll build it ourselves"**
- Response: "I respect that. Out of curiosity, have you estimated the total cost - engineering time, opportunity cost, ongoing maintenance?"
- Follow-up: "What happens if your dev team gets pulled onto other priorities?"

---

## Deal Review Criteria

**Weekly Deal Reviews** (Manager + AE):

Every opportunity in Qualification or later stages must answer:
1. **MEDDIC Complete?** All six elements documented and validated?
2. **Real Decision Date?** Timeline confirmed by Economic Buyer?
3. **Budget Confirmed?** Money allocated or clear path to budget?
4. **Champion Active?** Internal advocate selling when we're not there?
5. **Competition Known?** Who else are they evaluating? Our position?
6. **Risks Identified?** What could kill this deal?

**Red Flags** (triggers for deal review/coaching):
- Stage hasn't progressed in 30+ days
- Economic Buyer not identified by Demo stage
- Champion not engaged by Proposal stage
- MEDDIC elements incomplete or vague
- Close date pushed multiple times
- Ghosting after high engagement

---

## Sales Tools & Resources

**Required Tools**:
- **CRM**: IntelliFlow CRM (dogfooding our product)
- **Sales Engagement**: Outreach.io or SalesLoft
- **Intelligence**: LinkedIn Sales Navigator, ZoomInfo
- **Demos**: Custom demo environment (demo.intelliflow.com)
- **Proposals**: PandaDoc or Proposify
- **Contract Management**: DocuSign

**Enablement Resources**:
- Sales Battle Cards (competitive positioning)
- Case Studies (customer success stories)
- ROI Calculator (value quantification)
- Demo Scripts (standard demo flow)
- Discovery Scripts (question frameworks)
- Proposal Templates (MSA, SOW, pricing)

**Training**:
- MEDDIC Certification (required for all AEs)
- Product Deep Dives (monthly)
- Competitive Intelligence (quarterly)
- Objection Handling Role-plays (weekly)

---

## Success Metrics

**Individual AE Metrics**:
- **Quota Attainment**: ≥100% of quarterly quota
- **Pipeline Generation**: 3x quota in pipeline
- **Win Rate**: ≥25% (Qualification to Closed Won)
- **Sales Cycle**: ≤75 days average
- **MEDDIC Compliance**: 100% of deals Qualified+ stage

**Team Metrics**:
- **Revenue**: $X million ARR
- **New Logos**: Y new customers/quarter
- **Average Deal Size**: $Z ACV
- **Forecast Accuracy**: ±10% of commit
- **Customer Retention**: ≥90% net retention

---

## Continuous Improvement

**Win/Loss Analysis**:
- Post-deal debrief for all Closed Won and Closed Lost
- Document reasons for win/loss
- Share learnings in weekly team meetings
- Update playbook quarterly based on insights

**Playbook Updates**:
- Quarterly review with sales leadership
- Incorporate feedback from AEs and SEs
- A/B test new approaches
- Measure impact on win rates and cycle time

---

**Document History**:
- v1.0 (2025-12-22): Initial playbook creation
