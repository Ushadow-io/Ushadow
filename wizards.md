- enven though ushadow has lots of options, we want to make it easy for beginners to get started

in terms of systems/services we have:
* Memory:  Core of the stack. we should default to openmemory.
  - Dependancies:
     - sql / postgres:  user database and memories: bit hazy why we need this as well as vector database
     - vector db (qdrant)
     - graph mem (neo4j
     - LLM (small model for categorising
     - Probalbly want a chat interface too with a larger llm

    - Inputs
      - UI
      - MCP


* Voice/chronicle: Record conversations, transcribe them and store them in memory
 - Dependencies:
  - Speech-to-text service (e.g., Whisper / parakeet / deepgram
  - Redis: for queuing and sequenceing the conversation recordings
  - MongoDB: for storing convos

   - Inputs:
      - Microphone
      - Audio files
      - UI

* tailscale: needed to access services outside our network

* Speaker recognition:  Knows who is speaking
 - Dependencies:
  - Speaker recognition service (e.g., DeepSpeaker / Resemblyzer)
  - Redis: for caching speaker embeddings
  - MongoDB: for storing speaker profiles

- Inputs:
  - Microphone
  - Audio files
  - UI

* Agent framework: for acting and doing stuff

* Workflows: for deciding when to do stuff

* RAG:  reading documents 

* ?? Reading websites and snippets?  Pieces?


A lot of these services can be local, but it likely makes sense to start people out with the cloud version and then move to local afterwards.  Or we could ask the user at the start of the startup wizard?
- quickstart
- completely local
- Customise

A big question I have is how to deal with chronicle.  I could:
- start the backend as a container and rip front end components out of it
- Somehow extract the react componednts to show in my ui from the front end
- something else?

I think that's the order we want to install things in though, memory first, voice/chronicle, then speaker recognition, and then the rest.
Along this route we can have the default option, but be able to change it as we go through.  If we choose quickstart at the start, it will use cloud services as much as possible, local will favour local services.
Maybe the wizard is very simpilar, it just has different defaults?  The customised version could have everything on one page rather then step by step?
