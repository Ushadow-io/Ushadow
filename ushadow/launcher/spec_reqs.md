using existing fucntions in scripts/bootstrap.sh and scripts/bootstrap.ps1 we should be able to check the users existing installed components and install them in the background.

pre-requisites:
- git
- docker
- tailscale (optional)

we need to consider for mac that it may be an intel chip or an apple silicon chip.
We should not open a url to install the software as the point of the installer is to avoid all that.

for testing, we should not block any button in case there's an issue with detection.
the log should show the steps it is doing and not show polling info unless there is a change in state.

code should be written in a maintainable way rather than monolithic files. 
front end should re-use components from ushadow/front end whenenver possible.

we have 2 modes, dev-mode and quick-mode.
dev mode enables creation of multiple different environments and lets the user click through the different options. quick provides a single button that will do everyhing possible with no internactions.

default will be devmode until we get it working.
for testing, we will have a dry-run mode. this will show a suplemental control (enabled/disabled by feature flag) that lets me spoof the prescence or not of the prerequisites.
If this mode is on, the tool will execute the normal operations aside from it won't run the actual install command, and will just report success. this will enable us to test effevtively.

after pre-requisites pass, if we have no existing saved settings, we will ask the user if they want to clone ushdow to a new folder or link to an existing folder.

as instal happens, we will show what steps we are on through nice animations and icons.

we will have 2 columns, with the pre-requisites and shard infra on the left and the ushadow environments on the right.

# ushadow environments
should detect existing environments and provide options to create new ones or connect to existing ones