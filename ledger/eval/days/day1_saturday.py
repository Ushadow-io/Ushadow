"""Day 1, a Saturday at home. Invented people: Priya (owner), Tom (partner), a neighbour,
a restaurant, a shop assistant, Tom's colleague on speakerphone. TV news in the background.

Ground truth (true conversations, '@' tags in the scripts):
c1 08:02 breakfast, Priya + Tom (Tom identified). TV news in the background (media lines).
   Drifts: weather -> dripping tap -> Ruth's 70th birthday -> present -> restaurant. NO split.
c2 inside d1-a1: the neighbour Mr Haddad at the door about a parcel (new people + purpose).
   TOPIC SPLIT expected at his first line.
c3 d1-a2 phone, ~3 min later: Priya books a table at a restaurant (other person, other device).
   Gap model: NEW.
c4 d1-a3 pendant, ~1.5 min after the call: Priya + Tom (not identified this time) about the
   present and the shopping list. NEW vs c3 (other people, other device).
   d1-a4 pendant, ~7 min pause later: same two pick up the same list. Gap model: CONTINUES.
c5 10:30 d1-a5 pendant: hardware shop, Priya + shop assistant (unknown) about a tap cartridge.
   d1-a6 phone, ~50 s after the pendant died: the same talk goes on. Gap model: CONTINUES.
c6 12:10 d1-a7 pendant: cooking lunch, Priya + Tom (identified), pauses while cooking.
c7 inside d1-a7: Tom's colleague Grace calls on speakerphone about slides (short, unrelated).
   TOPIC SPLIT expected at the call.
c8 inside d1-a7: back to lunch talk after the call. TOPIC SPLIT expected at the return.
"""

from synth import Day, Rec, Who, date

P = Who("Speaker 0", "owner", "person-priya", "Priya")
TOM = Who("Speaker 1", "participant", "person-tom", "Tom")
TOM_ANON = Who("Speaker 1", "participant")
TV = Who("Speaker 2", "media")
NEIGHBOUR = Who("Speaker 3", "participant")
OTHER = Who("Speaker 1", "participant")
GRACE = Who("Speaker 3", "participant")

A1 = """
P: @c1 Morning. Is there any coffee left or did you finish it again?
T: There's half a pot. I made it strong, sorry.
TV: Good morning, it's eight o'clock and here are the headlines. Heavy rain is expected across the north west this afternoon.
P: Oh great, rain. So much for the walk.
T: We could still go this morning, before it starts.
TV: Commuters are warned of delays on the main rail line after a signal failure near the junction.
P: Mm. Can you turn that down a bit? I can't hear myself think.
T: Yeah, one sec. There.
TV: In sport, the city side came from two goals down to draw on Friday night.
P: Thanks. So, the walk. If we go at nine we're back by eleven, and then I want to go to the hardware place.
T: For the tap?
P: For the tap. It's been dripping all week, it drives me mad at night.
T: I looked at it on Thursday. I think it's the cartridge, not the washer. The whole handle wobbles.
P: Can you just buy a cartridge, or do you need the exact model?
T: You need the model, really. Take a photo of the handle, the guy in the shop will know.
~6
P: Okay. Photo. Remind me.
TV: And now the weather in more detail. A band of rain moves in from the west by early afternoon.
T: The other thing is Mum. Sunday. We still haven't decided anything.
P: I know, I know. Seventy. We have to do something proper.
T: She says she doesn't want a fuss.
P: She always says that. And then she's hurt if there's no fuss.
T: True. That's very true.
P: What about lunch somewhere? Everyone together. Your sister, the kids.
T: That's six of us. Seven if Dan comes.
P: Is Dan coming?
T: He said maybe. Which means no, probably.
P: Six then. And we book somewhere she likes. Not the Italian place, she complained about the noise last time.
T: Casa Morena? She liked the garden there.
P: Oh yes, the one with the courtyard. If it doesn't rain.
T: They have the inside room too. It's quieter.
~4
P: And a present. I don't want to do flowers again.
T: She keeps talking about that pottery class her friend did. Joan, I think. The one at the arts centre.
P: Oh, that's actually a really good idea. A voucher for a course.
T: How much are those?
P: No idea. Maybe a hundred? Hundred and twenty for six weeks?
T: That's fine. We could split it with Helen.
P: Your sister will want to give her own thing, she always does.
T: Then we just do it ourselves. It's her seventieth.
P: Okay. Pottery voucher. I'll look at the arts centre website.
T: And a card the kids can draw on.
P: Yes! She'll love that. Can you ask Helen to bring the kids early, like twelve?
T: I'll text her.
~8
P: Wait, is the toast burning?
T: No, no, it's fine. It's just the old toaster, it smells like that.
P: We really need a new toaster as well.
T: Add it to the list.
P: What list? We don't have a list. We have a pile of thoughts.
T: Ha. Then let's make a list later.
TV: Coming up after the break, a look at the new exhibition opening at the city museum.
P: So who calls the restaurant? I'd rather do it now before I forget.
T: You do it, you're better on the phone. They always put me on hold.
P: Fine. I'll call after I've finished my coffee. One o'clock, six people, inside room if it rains.
T: Perfect.
~3
T: Was that the door?
P: I think so. Hang on.
~5
NEIGHBOUR: @c2 Hello, sorry to bother you so early. I've got a parcel for you, the courier left it with me yesterday.
P: Oh, Mr Haddad, thank you so much. I didn't even know anything was coming.
NEIGHBOUR: It's quite heavy. It says fragile on the side, so I kept it in the hall.
P: That's really kind. Is it for me or for Tom?
NEIGHBOUR: It says P. Sharma. So you, I think.
P: Then it's probably the plant pots I ordered. I completely forgot about them.
NEIGHBOUR: Also, while I'm here, I wanted to ask. I'm going to cut the hedge on Monday, the side between us.
P: Oh, sure, that's fine.
NEIGHBOUR: It'll be a bit noisy in the morning. I'll start around nine, I hope that's alright.
P: No problem at all, we're both at work anyway.
NEIGHBOUR: And if you want, I can do your side of the top as well, I have the long trimmer.
P: That would be amazing, honestly. Let me know what we owe you.
NEIGHBOUR: Nothing, nothing. Maybe one of your lemon cakes.
P: Deal. I'll bake one this week.
NEIGHBOUR: Wonderful. Enjoy your weekend.
P: You too, and thanks again for the parcel.
"""

A2 = """
OTHER: @c3 Good morning, Casa Morena, how can I help?
P: Hi, good morning. I'd like to book a table for tomorrow, Sunday, for lunch.
OTHER: Of course. For how many people?
P: Six. Four adults and two children.
OTHER: And what time were you thinking?
P: One o'clock if possible.
OTHER: Let me have a look. One o'clock, six people. In the courtyard or inside?
P: It's supposed to rain, so inside please. The quieter room, if you have it.
OTHER: Yes, the back room is free at one. Can I have a name?
P: Sharma. S H A R M A.
OTHER: And a phone number, in case anything changes?
P: Sure, it's the mobile I'm calling from.
OTHER: Perfect, I can see it. Is it a special occasion?
P: Yes, it's my mother-in-law's seventieth birthday.
OTHER: Oh lovely. We can bring a small dessert with a candle, if you like.
P: That would be really nice, she'd love that.
OTHER: I'll put a note on it. So, Sunday at one, six people, back room, birthday.
P: That's it. Thank you so much.
OTHER: You're welcome. See you tomorrow.
"""

A3 = """
P: @c4 Done. One o'clock, the back room, and they'll bring a dessert with a candle.
TOM_ANON: Oh nice, she'll pretend to be embarrassed.
P: She will. And she'll tell everyone about it for a month.
TOM_ANON: Was the parcel the pots?
P: I think so, I haven't opened it yet. It's in the hall.
TOM_ANON: I'll carry it out to the garden later.
P: Thanks. Okay, so the voucher. I'm on the arts centre site. Six week beginner course, Tuesday evenings, a hundred and fifteen.
TOM_ANON: Tuesday is fine for her. She does bridge on Wednesdays.
P: There's also a Saturday morning one. Saturday might be nicer, she can go with Joan.
TOM_ANON: Does Joan want to do it again?
P: I don't know. Let's just get a gift voucher and she picks the day.
TOM_ANON: Yeah, that's simpler.
P: Okay, voucher, hundred and twenty, they print it or email it.
TOM_ANON: Get it printed. She won't open an email.
P: True. They say you can collect it at the desk. We could pick it up today when we're in town.
TOM_ANON: After the hardware shop.
P: Right. Now the list. Let me write it down properly this time.
TOM_ANON: Toaster.
P: Toaster. What else?
TOM_ANON: Bin bags, the big ones. And coffee, obviously.
P: Coffee. Milk. We're out of eggs too.
TOM_ANON: And something for lunch. I said I'd cook.
P: What are you making?
TOM_ANON: Maybe the lentil thing. The dal. With the spinach.
P: Then we need spinach, onions, and the yellow lentils. We have rice.
TOM_ANON: Do we have ginger?
P: There's a bit in the freezer, I think.
~10
TOM_ANON: Wrapping paper. For Sunday.
P: Oh good, yes. And a card. A big plain one so the kids can draw.
TOM_ANON: And candles? No, the restaurant does that.
P: The restaurant does that. Okay, I think that's it. Toaster, bin bags, coffee, milk, eggs, spinach, onions, lentils, wrapping paper, card.
TOM_ANON: And the tap cartridge.
P: And the tap cartridge. Okay. I'm going to jump in the shower and then we go.
TOM_ANON: I'll find the walking boots.
"""

A4 = """
TOM_ANON: @c4 Found the boots. Yours were under the stairs, all muddy from last time.
P: Thanks. Okay, about the list, I was thinking in the shower, we should add batteries.
TOM_ANON: For what?
P: The smoke alarm in the hall keeps chirping. And the pendant charger is broken, I need the little cable as well.
TOM_ANON: Batteries and cable. Is that at the hardware place or the supermarket?
P: Supermarket for batteries. The cable maybe the phone shop.
TOM_ANON: Let's skip the phone shop today. Too much.
P: Fine. Then order it online. And about the voucher, I just called Helen, sorry, texted Helen.
TOM_ANON: And?
P: She says she's bringing flowers anyway, so no clash. And the kids can come at twelve.
TOM_ANON: Good. So we're sorted for Sunday.
P: Almost. What do we do after lunch? Everyone back here for coffee?
TOM_ANON: If it rains, yes. Otherwise maybe the park with the kids.
P: Then I should bake something. Mr Haddad wants a lemon cake too, by the way.
TOM_ANON: What?
P: He's cutting our side of the hedge on Monday. I said I'd bake him a cake.
TOM_ANON: Then bake two. One for Mum, one for him.
P: Lemons then. Add lemons to the list. And butter, and sugar.
TOM_ANON: The list keeps growing.
P: It's a good list. Okay, shoes on, let's go before the rain.
"""

A5 = """
P: @c5 Hi, sorry, can you help me? I'm looking for a cartridge for a mixer tap. The handle wobbles and it drips.
OTHER: Sure. Do you know the brand of the tap?
P: I don't. I took a photo, hang on. Here.
OTHER: Ah, yes, that's one of the older lever ones. Could be a ceramic disc cartridge. Thirty-five millimetre, maybe forty.
P: How do I know which one?
OTHER: Best thing is to take the old one out and bring it in. Then we match it exactly.
P: I was hoping to fix it today though.
OTHER: Then you can count the splines on the top. See this, the little teeth where the handle sits on.
P: Right, okay. And if I buy the wrong one?
OTHER: Keep the receipt, you can bring it back within thirty days, as long as the packet isn't opened.
P: That's fair. Which ones do you have?
OTHER: We've got the thirty-five here and the forty in the back. Twenty spline and twenty-four spline.
P: And the price?
OTHER: Twelve ninety-nine for the thirty-five, fifteen for the forty.
P: Let me take both and bring one back. Is that okay?
OTHER: That's fine, just keep the one you don't use sealed.
P: Do I need to turn the water off at the mains?
OTHER: Under the sink there should be an isolating valve, a little screw. Turn it flat with a screwdriver.
P: And then the handle just pulls off?
OTHER: There's a small grub screw under the cap at the front. You'll need an Allen key, probably two and a half mil.
"""

A6 = """
P: @c5 Sorry, my recorder just died. You were saying, the Allen key.
OTHER: Yes, two and a half, sometimes three. We have a set over there for four pounds.
P: I'll take a set. We only have the big ones at home.
OTHER: Then you unscrew the big nut with an adjustable spanner, and the cartridge lifts out.
P: And the new one just goes in the same way?
OTHER: Same way round, there's a little lug that sits in a notch. Don't force it.
P: Do I need any plumber's tape or grease?
OTHER: A bit of silicone grease on the O-rings helps. We have small tubes at the till.
P: Great. So, two cartridges, the Allen keys, and the grease.
OTHER: That's it. And if it still drips after, it might be the seat, but that's rare.
P: Fingers crossed. Thanks so much, you've been really helpful.
OTHER: No problem. The till is just over there.
"""

A7 = """
TOM: @c6 Can you pass me the onions? The red ones.
P: Here. How many do you want chopped?
TOM: Two. Thin, not too thin.
P: Okay. So did the tap work in the end?
TOM: The thirty-five fits. I'll do it after lunch. The old one is completely cracked.
P: So we take the forty back on Monday.
TOM: Keep it in the car, otherwise we'll forget.
~25
P: These onions are strong. My eyes.
TOM: Put the knife in cold water. My mum swears by it.
P: That's a myth.
TOM: Probably. Pass me the ginger.
~18
P: So when do you leave for Leeds?
TOM: Tuesday, the early train. Seven twenty.
P: And back Thursday?
TOM: Thursday night. The workshop ends at four, so maybe the six o'clock train.
P: Then I'll do the vet on Wednesday on my own.
TOM: Oh, the vet. I forgot. What time is it?
P: Ten to five. It's just the booster jab, and they want to look at her ear.
TOM: Is she still scratching it?
P: All the time. And she hates the carrier, you know that.
TOM: Put a towel in it, the one she sleeps on.
~30
TOM: Can you stir this while I wash the spinach?
P: Sure. How long does it need?
TOM: Ten minutes, then the lentils go in.
~20
TOM: Oh, that's my phone. It's Grace. Sorry, I have to take this, it's about Tuesday.
GRACE: @c7 Hi Tom, sorry to call on a Saturday. Have you got two minutes?
TOM: Sure, go ahead. You're on speaker, I'm cooking.
GRACE: It's the slides for the workshop. The client wants the budget numbers on slide twelve updated before Tuesday.
TOM: The new numbers from Friday?
GRACE: Yes, the revised forecast. Marcus sent them last night. Do you have them?
TOM: I think so, they're in my email. I can do it tomorrow evening.
GRACE: That would be great. And can you move the timeline slide to the front, after the agenda?
TOM: Sure, timeline after the agenda. Anything else?
GRACE: No, that's it. I'll send you the final version Monday for a last check.
TOM: Perfect. See you on the train on Tuesday.
GRACE: See you then. Enjoy your weekend.
TOM: You too, bye.
~4
TOM: @c8 Sorry. Work. Where were we?
P: Lentils in, ten minutes. I stirred it.
TOM: Thanks. And the rice?
P: Rice is on. Twelve minutes.
TOM: So, Wednesday, the vet. Do you want me to book a taxi for you?
P: No, I'll drive. It's only ten minutes.
TOM: And Thursday, could you put the bins out? It's recycling week.
P: The blue one?
TOM: Blue and the glass box.
~15
P: That smells amazing. Is it the same recipe as last time?
TOM: I added more ginger. And a bit of lemon at the end.
P: Speaking of lemons, I need them for two cakes.
TOM: Two cakes, right. One for Mum, one for Mr Haddad.
P: I'll bake tonight, then the lemon one can rest overnight.
TOM: Can you make the small loaf for him? The big round one for Mum.
P: That's the plan. Okay, plates?
TOM: Plates. And the yoghurt from the fridge.
P: Got it. Let's eat.
"""

DAY = Day(
    name="day1",
    date=date(2026, 10, 17),
    recs=[
        Rec("d1-a1", "pendant", "08:02:00", {"P": P, "T": TOM, "TV": TV, "NEIGHBOUR": NEIGHBOUR},
            A1),
        Rec("d1-a2", "phone", "+190", {"P": P, "OTHER": OTHER}, A2),
        Rec("d1-a3", "pendant", "+90", {"P": P, "TOM_ANON": TOM_ANON}, A3),
        Rec("d1-a4", "pendant", "+420", {"P": P, "TOM_ANON": TOM_ANON}, A4),
        Rec("d1-a5", "pendant", "10:30:00", {"P": P, "OTHER": OTHER}, A5),
        Rec("d1-a6", "phone", "+50", {"P": P, "OTHER": OTHER}, A6),
        Rec("d1-a7", "pendant", "12:10:00", {"P": P, "TOM": TOM, "GRACE": GRACE}, A7),
    ],
    notes={
        "c1": "breakfast Priya+Tom, TV in background, drifting topics",
        "c2": "neighbour at the door (topic split inside d1-a1)",
        "c3": "phone: restaurant booking (other device, gap model: new)",
        "c4": "present + shopping list; d1-a4 after a 7 min pause (gap model: continues)",
        "c5": "hardware shop; pendant died, phone continues 50 s later (gap model: continues)",
        "c6": "cooking lunch Priya+Tom",
        "c7": "Grace calls Tom on speaker (topic split inside d1-a7)",
        "c8": "back to lunch after the call (topic split inside d1-a7)",
    },
)
