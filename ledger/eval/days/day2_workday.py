"""Day 2, a workday. Invented people: Priya (owner), Dev (colleague), Lena and Marco
(team), Anika (manager), a barista, a dental receptionist. Canteen TV in the background.

Ground truth (true conversations, '@' tags in the scripts):
c1 08:45 d2-b1 pendant: Priya orders coffee from a barista (short).
c2 inside d2-b1: Priya meets Dev outside and they walk to the office. TOPIC SPLIT expected
   at Dev's first line (other people, new purpose).
c3 09:30 d2-b2 laptop: team standup on a video call (Dev, Lena, Marco not identified).
c4 inside d2-b2: after the standup ends, Dev stays on and talks about his flat hunt. TOPIC
   SPLIT expected at "Have you got a sec, not work".
c5 10:20 d2-b3 pendant: 1:1 with Anika (identified). Someone knocks about the room booking
   (2 lines, NOT a conversation, no split). The pendant restarts: d2-b4, 30 s later, same
   device, same talk (rule: continues).
c6 10:52 d2-b5 phone: dentist reception call (other device, gap model: new).
c7 10:56 d2-b6 pendant: Dev (not identified) at Priya's desk about the invoice export bug.
   NEW vs c6. d2-b7 pendant 9 min later: Dev comes back, same bug (gap model: continues).
c8 13:00 d2-b8 pendant: lunch with Lena (not identified), football on the canteen TV.
"""

from synth import Day, Rec, Who, date

P = Who("Speaker 0", "owner", "person-priya", "Priya")
DEV = Who("Speaker 1", "participant", "person-dev", "Dev")
DEV_ANON = Who("Speaker 1", "participant")
LENA = Who("Speaker 2", "participant")
MARCO = Who("Speaker 3", "participant")
ANIKA = Who("Speaker 1", "participant", "person-anika", "Anika")
KNOCK = Who("Speaker 2", "participant")
OTHER = Who("Speaker 1", "participant")
TV = Who("Speaker 3", "media")

B1 = """
OTHER: @c1 Morning! What can I get you?
P: Morning. A flat white, please. Oat milk.
OTHER: Small or large?
P: Large. It's a Monday.
OTHER: Ha, fair enough. Anything to eat?
P: Go on, one of the almond croissants.
OTHER: That's six twenty. Tap is fine.
P: Thanks.
OTHER: Flat white with oat for you, enjoy.
~20
DEV: @c2 Priya! Wait up.
P: Oh hey Dev. Morning. Good weekend?
DEV: Busy. I saw four flats on Saturday. All of them terrible.
P: Four? That's a lot.
DEV: One had a bathroom in the kitchen. Like, literally, the shower was next to the fridge.
P: No way.
DEV: I swear. And the agent said it was cosy.
P: That's what cosy means now, I guess. What about you, are you still okay at your brother's?
DEV: For now. But his girlfriend is moving in next month, so, you know.
P: Ah, so you need something soon.
DEV: By the end of next month, ideally. Anyway. How was yours?
P: Good, actually. Tom's mum turned seventy, we did a lunch, and I fixed a tap.
DEV: You fixed a tap? Yourself?
P: Well, Tom did the last bit. But I bought the right part. Second try.
DEV: Respect. I can't even change a light bulb without a video.
P: Did you see the email from Marco about the invoice export?
DEV: The one with the red subject line? I saw it, I didn't read it.
P: Customers are getting empty files when the month has more than a thousand rows.
DEV: Ugh. That's the paging thing. I bet it's the paging.
P: Let's bring it up at standup.
DEV: Yeah. Are you going in through the side door? The main one is still broken.
P: Side door. Come on.
"""

B2 = """
LENA: @c3 Okay, I think everyone's here. Marco, can you hear us?
MARCO: Yes, loud and clear. Sorry, my camera is off, the wifi is bad today.
LENA: No worries. Let's do the usual. Dev, do you want to start?
DEV_ANON: Sure. Friday I finished the retry logic for the sync job, it's in review. Today I want to look at the invoice export issue.
LENA: The empty files?
DEV_ANON: Yes. Priya and I think it's the paging. If the month has more than a thousand rows, the second page comes back empty.
MARCO: That fits. All the tickets are from bigger customers.
LENA: How many tickets so far?
MARCO: Seven since Friday. Two are quite angry.
LENA: Okay, that's priority one then. Priya?
P: I'm on the reporting dashboard, the date filter. I'll pause that and pair with Dev on the export this morning.
LENA: Good. Can we get a fix out today?
P: If it's the paging, yes. It's a small change. But I want a test with a big month first.
MARCO: I can give you a customer export that fails. Anonymised.
P: That would be perfect.
LENA: Marco, what about you?
MARCO: Support queue mostly. And I'm writing the release notes for Thursday.
LENA: Is the release still on for Thursday?
MARCO: Yes, unless the export fix breaks something.
LENA: Then let's include the fix in Thursday's release, and if it's urgent we do a hotfix today.
DEV_ANON: Hotfix today would be better. The angry customers run payroll on the first.
LENA: Fair. Priya, Dev, keep me posted at lunch. Anything else? Blockers?
MARCO: The staging server is slow again. Someone should restart it.
DEV_ANON: I'll do it after this.
LENA: Thanks. I'm in planning most of the afternoon, so message me if you need anything.
LENA: Okay, that's it. Thanks everyone.
MARCO: Bye all.
~3
DEV_ANON: @c4 Priya, are you still there? Have you got a sec, not work.
P: Sure, what's up?
DEV_ANON: You live near Fernhill, right? Is it a nice area?
P: Fernhill is lovely. Quiet. A bit far from the station.
DEV_ANON: There's a flat there, two bedrooms, and it's actually in my budget. Which makes me suspicious.
P: Which street?
DEV_ANON: Alder Road. Near the little park.
P: Oh, Alder Road is nice. The houses there are old, though. Check for damp.
DEV_ANON: How do I check for damp?
P: Look behind the furniture, smell the bedroom wardrobes. If it smells like a basement, walk away.
DEV_ANON: Ha. Okay. And the bus?
P: The forty-two goes every ten minutes in the morning. It takes twenty minutes to town.
DEV_ANON: That's fine. I'm seeing it on Wednesday evening.
P: If you want, I can walk past it before. It's five minutes from us.
DEV_ANON: Would you? That would be amazing.
P: Send me the link. I'll have a look on Tuesday.
DEV_ANON: You're the best. Okay, now the export. Give me ten minutes, I'll restart staging first.
"""

B3 = """
ANIKA: @c5 Come in, sit down. How are you doing?
P: Good, thanks. A bit of a busy morning, there's an export bug.
ANIKA: I heard. Lena messaged me. Are you on it?
P: Dev and I, yes. We think it's paging. We should have a fix today.
ANIKA: Good. So, today I wanted to talk about two things. Your review, and the training budget.
P: Okay.
ANIKA: The review first. I've collected feedback from the team, and honestly, it's very positive.
P: That's nice to hear.
ANIKA: People mention how you help the juniors. Dev said you basically taught him the reporting code.
P: He picks things up fast.
ANIKA: Still. The question for the review is whether we put you forward for senior this round.
P: I'd like that. I wasn't sure if it was too early.
ANIKA: It's not too early. But the committee will want to see one thing you led end to end.
P: The dashboard project?
ANIKA: That could be it, if it ships before the end of the quarter.
P: It should. The date filter is the last big piece.
ANIKA: Then let's make that the case. Can you write a short summary, half a page, what you did and what the impact was?
P: When do you need it?
ANIKA: By the twentieth. I submit on the twenty-fifth.
~5
KNOCK: Sorry, is this room booked at eleven? We have a meeting here.
ANIKA: We'll be out by quarter to, no problem.
~3
ANIKA: Where were we. The summary, by the twentieth.
P: Okay. I'll send you a draft next week.
ANIKA: Great. Then the training budget. Everyone has eight hundred this year, and you haven't used any.
P: I know. I wanted to do the data engineering course, but it's twelve hundred.
ANIKA: I can top it up from the team budget if you share what you learn. A lunch talk, for example.
P: I'd be happy to do that.
"""

B4 = """
ANIKA: @c5 Sorry, I think your recorder just beeped. Anyway, the course. Send me the link and the dates.
P: It's online, evenings, starting in March. Eight weeks.
ANIKA: That works. Put it in the review summary as well, as a growth goal.
P: Will do.
ANIKA: Anything from your side? Anything that's bothering you?
P: Honestly, the on-call rota. I've been on call three weekends out of the last six.
ANIKA: That's too many. Why?
P: People swapped with me, and I said yes every time.
ANIKA: Then stop saying yes. I'll look at the rota with Lena and make it fair.
P: Thanks. That would help a lot.
ANIKA: And Marco is joining the rota next month, so it will get lighter anyway.
P: Good to know.
ANIKA: Okay. Summary by the twentieth, course link, and I'll fix the rota. Anything else?
P: No, that's it. Thanks, Anika.
ANIKA: Thank you. Go fix that export.
"""

B5 = """
OTHER: @c6 Hello, this is Brook Street Dental, am I speaking to Priya Sharma?
P: Yes, speaking.
OTHER: I'm calling to confirm your appointment on Thursday at eight fifteen with Doctor Reyes.
P: Thursday, eight fifteen. Yes, that's fine.
OTHER: It's the six month check-up and a clean with the hygienist after.
P: How long will it take altogether?
OTHER: About forty-five minutes.
P: Okay, then I'll be at work by half nine. Perfect.
OTHER: Please bring your new insurance card, we have the old number on file.
P: Oh, right, I'll bring it.
OTHER: Lovely. See you on Thursday.
P: Thanks, bye.
"""

B6 = """
DEV_ANON: @c7 Okay, I restarted staging. Marco sent the failing export. Do you want to look at it with me?
P: Sure, pull up a chair. Let's open the export service.
DEV_ANON: So here, the page size is a thousand. And here we build the next cursor.
P: And the cursor uses the last id of the page.
DEV_ANON: Right. But look, the query sorts by date, not by id.
P: Oh. So the last id of the page isn't the biggest id.
DEV_ANON: Exactly. So the next page asks for ids bigger than something random, and sometimes gets nothing.
P: That's it. That's the bug. Nice.
DEV_ANON: So we sort by date and then id, and the cursor carries both.
P: Yes. A compound cursor. Date and id.
DEV_ANON: Do we have to worry about old cursors? Clients that are halfway through an export?
P: Exports are one request from the user's point of view. The cursor never leaves the server.
DEV_ANON: Great, then no migration. Let me write the test first. The big month from Marco.
P: Use a month with exactly one thousand and one rows, that's the edge.
DEV_ANON: And one with two thousand. Okay. Give me a bit.
P: I'll get water. Shout if you need me.
"""

B7 = """
DEV_ANON: @c7 Priya, it works. Both tests pass. The thousand and one and the two thousand.
P: Amazing. And the old tests?
DEV_ANON: All green. I also ran Marco's file against staging. Fourteen hundred rows, all there.
P: Let's check the CSV header. Last time someone changed the column order by accident.
DEV_ANON: Header is the same. I compared it with Friday's file.
P: Then open the pull request and add me and Lena.
DEV_ANON: Should we hotfix today or wait for Thursday?
P: Today. Lena said if it's urgent. The payroll customers export on the first.
DEV_ANON: Okay. I'll write in the PR that it's a hotfix and why.
P: And tell Marco, he can answer the tickets.
DEV_ANON: Yep. Lunch after?
P: I'm having lunch with Lena. Join us if you want.
DEV_ANON: I'll grab something at my desk, I want to watch the deploy.
"""

B8 = """
LENA: @c8 This table okay? Away from the window, it's freezing over there.
P: Perfect. Oh no, the football is on again.
TV: And it's a corner for the visitors, the keeper punches it clear, but only as far as the edge of the box.
LENA: Every lunch. Someone in facilities must be a big fan.
P: So, how was planning?
LENA: Long. But fine. Dev told me the export is fixed, by the way. Hotfix this afternoon.
P: Yes, he did great. It was the cursor, the sort order.
LENA: I don't need the details, I trust you. Did Anika talk to you about the review?
P: She did. She wants to put me forward for senior.
LENA: Finally! I told her months ago.
P: Thanks, Lena. Really.
TV: What a save! He was at full stretch there, that's a brilliant stop.
LENA: Okay, not work. Tell me about the weekend, how was the birthday?
P: Lovely. Tom's mum cried when she opened the pottery voucher.
LENA: Aw. Pottery! That's so sweet.
P: And the restaurant brought a cake with a candle, she was so embarrassed and so happy.
LENA: That's the best kind of embarrassed.
~6
P: How about you? Wasn't it your sister's wedding thing?
LENA: The engagement party. Saturday. It was chaos.
P: Good chaos or bad chaos?
LENA: Mostly good. My uncle gave a speech for twenty minutes. Nobody asked him.
P: There's always one.
LENA: And the wedding is in Portugal next June, so now I have to plan a trip.
P: Oh, that sounds amazing though. Where in Portugal?
LENA: Near Porto. A vineyard. Very fancy.
TV: Half time here, and it's still goalless. More after the break.
P: You should take a week and do the coast after.
LENA: That's the plan. If I can get a week off in June.
P: Book it now, before the summer rush. Anika is fine with leave if you ask early.
LENA: Good point. I'll put it in today.
P: Do you want another coffee?
LENA: No, I have to go, planning part two. Thanks for lunch.
"""

DAY = Day(
    name="day2",
    date=date(2026, 10, 19),
    seed=11,
    recs=[
        Rec("d2-b1", "pendant", "08:45:00", {"P": P, "OTHER": OTHER, "DEV": DEV}, B1),
        Rec("d2-b2", "laptop", "09:30:00",
            {"P": P, "LENA": LENA, "MARCO": MARCO, "DEV_ANON": DEV_ANON}, B2),
        Rec("d2-b3", "pendant", "10:20:00", {"P": P, "ANIKA": ANIKA, "KNOCK": KNOCK}, B3),
        Rec("d2-b4", "pendant", "+30", {"P": P, "ANIKA": ANIKA}, B4),
        Rec("d2-b5", "phone", "+240", {"P": P, "OTHER": OTHER}, B5),
        Rec("d2-b6", "pendant", "+90", {"P": P, "DEV_ANON": DEV_ANON}, B6),
        Rec("d2-b7", "pendant", "+540", {"P": P, "DEV_ANON": DEV_ANON}, B7),
        Rec("d2-b8", "pendant", "13:00:00", {"P": P, "LENA": LENA, "TV": TV}, B8),
    ],
    notes={
        "c1": "barista, coffee order",
        "c2": "walk to the office with Dev (topic split inside d2-b1)",
        "c3": "team standup on a video call",
        "c4": "Dev's flat hunt after the standup (topic split inside d2-b2)",
        "c5": "1:1 with Anika; a 2-line knock is not a conversation; pendant restarts 30 s",
        "c6": "phone: dentist reception (other device, gap model: new)",
        "c7": "invoice bug at the desk; d2-b7 after a 9 min pause (gap model: continues)",
        "c8": "lunch with Lena, football on TV",
    },
)
