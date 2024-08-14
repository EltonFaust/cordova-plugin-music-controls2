
let audioEl;
let sourceEl;

let onUpdate = () => {};

let isInitialized = false;
let actionHandlers = [];
let audioDuration = 0;
let audioElapsed = 0;

const STATE_PLAYING = 'playing';
const STATE_PAUSED = 'paused';
const STATE_NONE = 'none';

const setState = (state) => {
    window.navigator.mediaSession.playbackState = state;
};

const initialize = async (data) => {
    if (!('mediaSession' in window.navigator)) {
        throw new Error('Media Session not supported');
    }

    isInitialized = true;

    // a valid and running audio is required when using the Media Session
    if (data.createAudioHandler && !audioEl) {
        audioEl = window.document.createElement('audio');
        sourceEl = window.document.createElement('source');

        // mp3 blank audio, most common support
        sourceEl.src = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV////////////////////////////////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQDkAAAAAAAAAGw9wrNaQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxHYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

        audioEl.appendChild(sourceEl);
        audioEl.style.setProperty('display', 'none');

        document.body.appendChild(audioEl);

        audioEl.load();
        audioEl.loop = true;

        await audioEl.play();
        await audioEl.pause();
    } else if (!data.createAudioHandler && audioEl) {
        sourceEl.remove();
        audioEl.remove();
    }

    // add the handlers
    actionHandlers = [
        ['play', 'music-controls-play', true],
        ['pause', 'music-controls-pause', true],
        ['stop', 'music-controls-destroy', true, null, () => setState(STATE_NONE)],
        ['previoustrack', 'music-controls-next', data.hasPrev],
        ['nexttrack', 'music-controls-previous', data.hasNext],
        ['seekbackward', 'music-controls-seek-to', data.hasSkipForward, ({ seekOffset }) => ({ position: Math.max(0, audioElapsed - seekOffset) })],
        ['seekforward', 'music-controls-seek-to', data.hasSkipBackward, ({ seekOffset }) => ({ position: Math.min(audioDuration, audioElapsed + seekOffset) })],
        ['seekto', 'music-controls-seek-to', data.hasScrubbing, ({ seekTime }) => ({ position: Math.min(audioDuration, seekTime) })],
    ].reduce((c, [evtRec, evtSend, useAction, extract, postAction]) => {
        try {
            if (useAction) {
                if (actionHandlers.includes(evtRec)) {
                    return c;
                }

                const ext = extract || (() => ({}));
                const poac = postAction || (() => {});

                window.navigator.mediaSession.setActionHandler(
                    evtRec,
                    (data) => {
                        onUpdate(JSON.stringify({ message: evtSend, ...ext(data) }));
                        poac();
                    },
                );

                return [...c, evtRec];
            }

            if (actionHandlers.includes(evtRec)) {
                window.navigator.mediaSession.setActionHandler(evtRec, null);
            }

            return c;
        } catch (e) {
            // can't add event handler
            return c;
        }
    }, []);

    setState(STATE_NONE);
};

const destroy = () => {
    if (!isInitialized) {
        return;
    }

    isInitialized = false;

    // remove all action handlers
    actionHandlers.forEach((evtRec) => {
        window.navigator.mediaSession.setActionHandler(evtRec, null);
    });

    if (audioEl) {
        sourceEl.remove();
        audioEl.remove();
    }

    setState(STATE_NONE);
};

require('cordova/exec/proxy').add('MusicControls', {
    create: async (successCallback, errorCallback, params) => {
        const data = params[0];

        try {
            await initialize(data);
        } catch (e) {
            errorCallback(e.message);
            return;
        }

        const mediaMetadata = {
            title: data.track,
            artist: data.artist,
            album: data.album,
        };

        if (data.cover) {
            // resolve the url to prevent problems with relative locales (eg: /assets/imgs/cover.png)
            const resolved = new URL(data.cover, window.location.href);

            mediaMetadata.artwork = [{
                src: resolved.toString(),
                sizes: 'any',
            }];
        }

        window.navigator.mediaSession.metadata = new window.MediaMetadata(mediaMetadata);

        audioDuration = data.duration;
        audioElapsed = data.elapsed;

        window.navigator.mediaSession.setPositionState({
            playbackRate: 1,
            duration: audioDuration,
            position: audioElapsed,
        });

        setState(data.isPlaying ? STATE_PLAYING : STATE_PAUSED);

        successCallback('success');
    },

    updateIsPlaying: async (successCallback, errorCallback, params) => {
        if (isInitialized) {
            setState(params[0].isPlaying ? STATE_PLAYING : STATE_PAUSED);
        }

        successCallback('success');
    },

    updateElapsed: (successCallback, errorCallback, params) => {
        if (isInitialized) {
            const data = params[0];

            audioElapsed = data.elapsed;

            window.navigator.mediaSession.setPositionState({
                playbackRate: 1,
                duration: audioDuration,
                position: data.elapsed,
            });

            setState(data.isPlaying ? STATE_PLAYING : STATE_PAUSED);
        }

        successCallback('success');
    },

    updateDismissable: (successCallback, errorCallback, params) => {
        // nothing to do
    },

    destroy: (successCallback, errorCallback, params) => {
        // Remove events
        destroy();
        onUpdate(JSON.stringify({ message: 'music-controls-stop-listening' }));
        onUpdate = () => {};
        successCallback('success');
    },

    watch: (_onUpdate) => {
        // Set callback
        onUpdate = _onUpdate;
    },
});
