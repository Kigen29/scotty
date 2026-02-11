

# Autonomous Lead Generation & Outreach System

## Overview
A fully autonomous system that discovers Kenyan businesses without websites/systems, crafts personalized cold emails offering your software services, manages follow-ups, and provides a reporting dashboard — all running on autopilot.

---

## Page 1: Dashboard (Home)
- **Pipeline overview**: Total leads discovered, contacted, responded, interested, not interested
- **Activity feed**: Real-time log of system actions (discoveries, emails sent, replies received)
- **Key metrics cards**: Response rate, conversion rate, emails sent this week
- **Quick filters**: By business category, location, status

## Page 2: Lead Discovery Engine
- **Business search panel**: Search for businesses by industry (restaurants, salons, hardware stores, clinics, etc.) and location (Nairobi, Mombasa, Kisumu, etc.)
- **Automated discovery**: System uses web search and business directories to find businesses, then checks if they have a website
- **Lead cards**: Each discovered business shows name, category, location, phone, social media links, and "has website" status
- **Bulk actions**: Approve leads for outreach, dismiss irrelevant ones

## Page 3: Email Campaign Manager
- **AI-powered email composer**: For each business, AI crafts a personalized email that:
  - References the specific business and its industry
  - Identifies pain points (no online presence, manual processes, etc.)
  - Showcases your relevant portfolio (e.g., lakevictoriaaquaculture.com for a fish business)
  - Proposes specific solutions tailored to their business
- **Email templates**: Manage first-touch, follow-up #1, follow-up #2, and final follow-up templates
- **Follow-up automation**: Automatic follow-ups at configurable intervals (e.g., 3 days, 7 days, 14 days)
- **Email preview**: Review any email before or after it's sent

## Page 4: Conversations & Responses
- **Inbox view**: Track all email threads with business owners
- **Status tracking**: Categorize responses as Interested, Not Interested, Need More Info, No Response
- **AI-suggested replies**: When a business owner responds, AI suggests an appropriate reply
- **Handoff alerts**: When a lead is "hot" (interested), you get notified to take over the conversation personally

## Page 5: Reports & Analytics
- **Outreach performance**: Emails sent, open rates (if trackable), response rates
- **Lead funnel**: Discovery → Contacted → Responded → Interested → Converted
- **Weekly/monthly reports**: Automated summary of activity and results
- **Export**: Download lead data and reports as CSV

## Page 6: Settings
- **Company profile**: Your company name, services, portfolio links, email signature
- **Email configuration**: Sending email setup, daily send limits
- **Automation rules**: Follow-up intervals, business categories to target, locations to search
- **Scheduling**: Set active hours for the system (e.g., send emails only during business hours EAT)

---

## Backend Requirements
- **Lovable Cloud** for database, edge functions, and scheduled tasks
- **Lovable AI** for personalized email generation and business research analysis
- **Firecrawl** for web scraping business directories and checking if businesses have websites
- **Email integration** (Resend) for sending outreach emails
- **Scheduled jobs** for automated discovery runs, follow-up emails, and report generation

## How It Works (Autonomous Flow)
1. **Discover**: System searches business directories and Google for businesses in target categories/locations in Kenya
2. **Qualify**: Checks if each business has a website — those without are flagged as leads
3. **Research**: AI analyzes the business to understand their needs and craft a personalized pitch
4. **Email**: Sends a tailored cold email offering your specific services
5. **Follow-up**: If no response, automatically sends follow-ups at set intervals
6. **Report**: Dashboard updates in real-time with all activity and responses

