// Covers the "data-into / data-empty inline error messaging" parity item,
// which the audit had as present-but-never-individually-tested.
//
// checkFormInputs() writes a context-aware validation message into the element
// named by data-into. V2's implementation is a verbatim port of V1's (V1
// core.js:4321 -> V2 vendor/reconnecting-websocket.js:3497), including V1's
// own quirk that `lbl.find(sel)` returns an always-truthy jQuery object, so
// the documented label -> fieldset -> global fallback does not actually chain
// once a <label> ancestor exists. That behaviour is kept deliberately: it is
// what every real V1 page was written against.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

function freshDOM(bodyHtml) {
    const dom = new JSDOM(
        `<!doctype html><body>${bodyHtml}<script>${bundleSrc}</script></body>`,
        {
            url: 'http://127.0.0.1:19991/', runScripts: 'dangerously',
            beforeParse(window) {
                window.URL.createObjectURL = () => 'blob:test';
                window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
                window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
            }
        }
    );
    return dom.window;
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

setTimeout(() => {
    // --- data-empty text written into the data-into target ---
    {
        const win = freshDOM(`<form id="f">
            <label><input id="a" :required data-into=".msg" data-empty="Name is required" placeholder="ph"><span class="msg"></span></label>
        </form>`);
        const $ = win.$;
        win.checkFormInputs($('#f'));
        const msg = $('#f').find('.msg').text();
        check('an empty :required field writes its data-empty text into the data-into target',
            msg === 'Name is required', JSON.stringify(msg));
        check('the field is marked invalid', $('#a').hasClass('is-invalid'), $('#a')[0].className);
    }

    // --- no data-empty: falls back to placeholder (V1's own behaviour) ---
    {
        const win = freshDOM(`<form id="f">
            <label><input id="a" :required data-into=".msg" placeholder="Enter your city"><span class="msg"></span></label>
        </form>`);
        const $ = win.$;
        win.checkFormInputs($('#f'));
        check('with no data-empty, the placeholder text is used instead',
            $('#f').find('.msg').text() === 'Enter your city', JSON.stringify($('#f').find('.msg').text()));
    }

    // --- [username] shorter than 4 chars uses data-4-chars ---
    {
        const win = freshDOM(`<form id="f">
            <label><input id="u" username :required data-into=".msg" data-empty="Username required"
                   data-4-chars="At least 4 characters" placeholder="ph" value="ab"><span class="msg"></span></label>
        </form>`);
        const $ = win.$;
        $('#u').val('ab');
        win.checkFormInputs($('#f'));
        check('a [username] under 4 chars gets the not-4-chars class',
            $('#u').hasClass('not-4-chars'), $('#u')[0].className);
        check('a [username] under 4 chars writes its data-4-chars message',
            $('#f').find('.msg').text() === 'At least 4 characters', JSON.stringify($('#f').find('.msg').text()));
    }

    // --- a valid field must not leave a stale message class behind ---
    {
        const win = freshDOM(`<form id="f">
            <label><input id="a" :required data-into=".msg" data-empty="Required" value="filled in"><span class="msg"></span></label>
        </form>`);
        const $ = win.$;
        $('#a').val('filled in');
        win.checkFormInputs($('#f'));
        check('a filled field is not marked invalid', !$('#a').hasClass('is-invalid'), $('#a')[0].className);
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
}, 400);
