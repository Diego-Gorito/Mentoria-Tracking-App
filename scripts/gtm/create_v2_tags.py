#!/usr/bin/env python3
"""
Cria tags base + eventos nas 5 plataformas novas + Bing UET + Quora extras
no GTM-WLZ3H8VH (WEB V2, container 253664662, workspace 2).

Estratégia: paused=True em TODAS pra Diego validar antes de publicar.
"""
import warnings, json, time, sys
warnings.filterwarnings('ignore')
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

KEY = '/Volumes/SSD 2T/Dev/tracking-claude-sa.json'
SCOPES = ['https://www.googleapis.com/auth/tagmanager.edit.containers']
creds = service_account.Credentials.from_service_account_file(KEY, scopes=SCOPES)
sess = AuthorizedSession(creds)

ACCOUNT = '6059193756'
CONTAINER = '253664662'  # GTM-WLZ3H8VH
WS = '2'
BASE = f'https://tagmanager.googleapis.com/tagmanager/v2/accounts/{ACCOUNT}/containers/{CONTAINER}/workspaces/{WS}'

# Template IDs (cvt_253664662_X)
T_TWITTER_BASE = 'cvt_253664662_114'
T_TWITTER_EVENT = 'cvt_253664662_118'
T_REDDIT = 'cvt_253664662_115'
T_PINTEREST = 'cvt_253664662_116'
T_SNAP = 'cvt_253664662_117'

# Triggers (existing)
TRG_ALL_PAGES = '85'        # DOM Ready | Todas
TRG_PAGE_VIEW = '88'        # Primeiro page_view (CT)
TRG_PURCHASE = '80'         # purchase
TRG_BEGIN_CHECKOUT = '81'   # begin_checkout
TRG_VIEW_CONTENT = '82'     # view_content
TRG_SIGN_UP = '65'          # sign_up
TRG_FORM_SUBMIT = '87'      # Envio Form

def tpl(key, value):
    return {'type': 'TEMPLATE', 'key': key, 'value': value}

def boolean(key, value):
    return {'type': 'BOOLEAN', 'key': key, 'value': 'true' if value else 'false'}

def integer(key, value):
    return {'type': 'INTEGER', 'key': key, 'value': str(value)}

def list_param(key, items):
    return {'type': 'LIST', 'key': key, 'list': items}

def map_param(key, items):
    return {'type': 'MAP', 'key': key, 'map': items}

def create_tag(name, type_, params, firing_triggers, paused=True):
    body = {
        'name': name,
        'type': type_,
        'parameter': params,
        'firingTriggerId': firing_triggers,
        'paused': paused,
    }
    r = sess.post(f'{BASE}/tags', json=body)
    if r.status_code in (200, 201):
        print(f"  ✅ {name}")
        return True
    else:
        print(f"  ❌ {name} [{r.status_code}]: {r.text[:200]}")
        return False

# ===================================================================
# DEFINIÇÕES DE TAGS
# ===================================================================
TAGS = []

# ---------- Twitter (X) Ads ----------
TAGS.append({
    'name': '04.00 [CT] [X Ads] Base Pixel',
    'type': T_TWITTER_BASE,
    'params': [
        tpl('pixel_id', '{{[CT] [X Ads] Pixel ID}}'),
        tpl('page_location_op', '1'),  # Hide
    ],
    'triggers': [TRG_ALL_PAGES],
})

# X Ads conversion events (pixel_id ainda obrigatório nos events?)
# Twitter Event Pixel só precisa event_id + opcionais
TAGS.append({
    'name': '04.01 [CT] [X Ads] Evento | Lead (form submit)',
    'type': T_TWITTER_EVENT,
    'params': [
        tpl('event_id', 'tw-{{[CT] [X Ads] Pixel ID}}-lead'),
    ],
    'triggers': [TRG_FORM_SUBMIT],
})
TAGS.append({
    'name': '04.02 [CT] [X Ads] Evento | Purchase',
    'type': T_TWITTER_EVENT,
    'params': [
        tpl('event_id', 'tw-{{[CT] [X Ads] Pixel ID}}-purchase'),
        tpl('value', '{{[CT] [VAR] value}}'),
        tpl('currency', '{{[CT] [VAR] currency}}'),
        tpl('conversion_id', '{{[CT] [VAR] transaction_id}}'),
    ],
    'triggers': [TRG_PURCHASE],
})
TAGS.append({
    'name': '04.03 [CT] [X Ads] Evento | InitiateCheckout',
    'type': T_TWITTER_EVENT,
    'params': [
        tpl('event_id', 'tw-{{[CT] [X Ads] Pixel ID}}-checkout'),
        tpl('value', '{{[CT] [VAR] value}}'),
        tpl('currency', '{{[CT] [VAR] currency}}'),
    ],
    'triggers': [TRG_BEGIN_CHECKOUT],
})
TAGS.append({
    'name': '04.04 [CT] [X Ads] Evento | CompleteRegistration',
    'type': T_TWITTER_EVENT,
    'params': [
        tpl('event_id', 'tw-{{[CT] [X Ads] Pixel ID}}-signup'),
    ],
    'triggers': [TRG_SIGN_UP],
})

# ---------- Reddit ----------
TAGS.append({
    'name': '05.00 [CT] [Reddit] Pixel Base',
    'type': T_REDDIT,
    'params': [
        tpl('id', '{{[CT] [Reddit] Pixel ID}}'),
        tpl('eventType', 'PageVisit'),
        boolean('enableFirstPartyCookies', True),
    ],
    'triggers': [TRG_ALL_PAGES],
})
TAGS.append({
    'name': '05.01 [CT] [Reddit] Evento | Lead',
    'type': T_REDDIT,
    'params': [
        tpl('id', '{{[CT] [Reddit] Pixel ID}}'),
        tpl('eventType', 'Lead'),
        tpl('conversionId', '{{[CT] [VAR] transaction_id}}'),
    ],
    'triggers': [TRG_FORM_SUBMIT],
})
TAGS.append({
    'name': '05.02 [CT] [Reddit] Evento | Purchase',
    'type': T_REDDIT,
    'params': [
        tpl('id', '{{[CT] [Reddit] Pixel ID}}'),
        tpl('eventType', 'Purchase'),
        tpl('currency', '{{[CT] [VAR] currency}}'),
        tpl('transactionValue', '{{[CT] [VAR] value}}'),
        tpl('transactionId', '{{[CT] [VAR] transaction_id}}'),
    ],
    'triggers': [TRG_PURCHASE],
})

# ---------- Pinterest ----------
TAGS.append({
    'name': '06.00 [CT] [Pinterest] Pixel Base',
    'type': T_PINTEREST,
    'params': [
        tpl('tagId', '{{[CT] [Pinterest] Tag ID}}'),
        tpl('eventName', ''),  # base code only
        tpl('em', '{{[CT] [VAR] Email}}'),
    ],
    'triggers': [TRG_ALL_PAGES],
})
TAGS.append({
    'name': '06.01 [CT] [Pinterest] Evento | Lead',
    'type': T_PINTEREST,
    'params': [
        tpl('tagId', '{{[CT] [Pinterest] Tag ID}}'),
        tpl('eventName', 'lead'),
        tpl('lead_type', 'sign-up'),
    ],
    'triggers': [TRG_FORM_SUBMIT],
})
TAGS.append({
    'name': '06.02 [CT] [Pinterest] Evento | Checkout',
    'type': T_PINTEREST,
    'params': [
        tpl('tagId', '{{[CT] [Pinterest] Tag ID}}'),
        tpl('eventName', 'checkout'),
    ],
    'triggers': [TRG_BEGIN_CHECKOUT],
})

# ---------- Snap ----------
TAGS.append({
    'name': '07.00 [CT] [Snap] Pixel Base',
    'type': T_SNAP,
    'params': [
        tpl('pixel_id', '{{[CT] [Snap] Pixel ID}}'),
        tpl('event_type', 'PAGE_VIEW'),
    ],
    'triggers': [TRG_ALL_PAGES],
})
TAGS.append({
    'name': '07.01 [CT] [Snap] Evento | Sign Up',
    'type': T_SNAP,
    'params': [
        tpl('pixel_id', '{{[CT] [Snap] Pixel ID}}'),
        tpl('event_type', 'SIGN_UP'),
        tpl('user_hashed_email', '{{[CT] [VAR] Cookie Primário | em}}'),
    ],
    'triggers': [TRG_SIGN_UP],
})
TAGS.append({
    'name': '07.02 [CT] [Snap] Evento | Add Cart',
    'type': T_SNAP,
    'params': [
        tpl('pixel_id', '{{[CT] [Snap] Pixel ID}}'),
        tpl('event_type', 'ADD_CART'),
        tpl('price', '{{[CT] [VAR] value}}'),
        tpl('currency', '{{[CT] [VAR] currency}}'),
    ],
    'triggers': [TRG_BEGIN_CHECKOUT],
})
TAGS.append({
    'name': '07.03 [CT] [Snap] Evento | Purchase',
    'type': T_SNAP,
    'params': [
        tpl('pixel_id', '{{[CT] [Snap] Pixel ID}}'),
        tpl('event_type', 'PURCHASE'),
        tpl('price', '{{[CT] [VAR] value}}'),
        tpl('currency', '{{[CT] [VAR] currency}}'),
        tpl('transaction_id', '{{[CT] [VAR] transaction_id}}'),
    ],
    'triggers': [TRG_PURCHASE],
})

# ---------- Bing UET ----------
TAGS.append({
    'name': '08.00 [CT] [Bing UET] Base Pixel',
    'type': 'baut',  # Built-in Bing Ads UET
    'params': [
        tpl('tagId', '{{[CT] [Bing UET] Tag ID}}'),
        tpl('uetqName', 'uetq'),
        tpl('eventType', 'PAGE_LOAD'),
    ],
    'triggers': [TRG_ALL_PAGES],
})
TAGS.append({
    'name': '08.01 [CT] [Bing UET] Evento | Lead',
    'type': 'baut',
    'params': [
        tpl('tagId', '{{[CT] [Bing UET] Tag ID}}'),
        tpl('uetqName', 'uetq'),
        tpl('eventType', 'userDefined'),
        tpl('customEventAction', 'generate_lead'),
    ],
    'triggers': [TRG_FORM_SUBMIT],
})
TAGS.append({
    'name': '08.02 [CT] [Bing UET] Evento | Purchase',
    'type': 'baut',
    'params': [
        tpl('tagId', '{{[CT] [Bing UET] Tag ID}}'),
        tpl('uetqName', 'uetq'),
        tpl('eventType', 'userDefined'),
        tpl('customEventAction', 'purchase'),
    ],
    'triggers': [TRG_PURCHASE],
})
TAGS.append({
    'name': '08.03 [CT] [Bing UET] Evento | Contact',
    'type': 'baut',
    'params': [
        tpl('tagId', '{{[CT] [Bing UET] Tag ID}}'),
        tpl('uetqName', 'uetq'),
        tpl('eventType', 'userDefined'),
        tpl('customEventAction', 'contact'),
    ],
    'triggers': [TRG_FORM_SUBMIT],
})

# ---------- Quora (HTML — events) ----------
QUORA_LEAD_HTML = """<script>
!function(q,e,v,n,t,s){if(q.qp)return;n=q.qp=function(){n.qp?n.qp.apply(n,arguments):n.queue.push(arguments);};n.queue=[];t=document.createElement(e);t.async=!0;t.src=v;s=document.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,'script','https://a.quora.com/qevents.js');
qp('init','{{[CT] [Quora] Pixel ID}}');
qp('track','Lead');
</script>"""

QUORA_PURCHASE_HTML = """<script>
!function(q,e,v,n,t,s){if(q.qp)return;n=q.qp=function(){n.qp?n.qp.apply(n,arguments):n.queue.push(arguments);};n.queue=[];t=document.createElement(e);t.async=!0;t.src=v;s=document.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,'script','https://a.quora.com/qevents.js');
qp('init','{{[CT] [Quora] Pixel ID}}');
qp('track','Purchase', {value: '{{[CT] [VAR] value}}', currency: '{{[CT] [VAR] currency}}'});
</script>"""

QUORA_VIEWCONTENT_HTML = """<script>
!function(q,e,v,n,t,s){if(q.qp)return;n=q.qp=function(){n.qp?n.qp.apply(n,arguments):n.queue.push(arguments);};n.queue=[];t=document.createElement(e);t.async=!0;t.src=v;s=document.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,'script','https://a.quora.com/qevents.js');
qp('init','{{[CT] [Quora] Pixel ID}}');
qp('track','ViewContent');
</script>"""

TAGS.append({
    'name': '14.01 [CT] [Quora] Evento | Lead',
    'type': 'html',
    'params': [
        tpl('html', QUORA_LEAD_HTML),
        boolean('supportDocumentWrite', False),
    ],
    'triggers': [TRG_FORM_SUBMIT],
})
TAGS.append({
    'name': '14.02 [CT] [Quora] Evento | Purchase',
    'type': 'html',
    'params': [
        tpl('html', QUORA_PURCHASE_HTML),
        boolean('supportDocumentWrite', False),
    ],
    'triggers': [TRG_PURCHASE],
})
TAGS.append({
    'name': '14.03 [CT] [Quora] Evento | ViewContent',
    'type': 'html',
    'params': [
        tpl('html', QUORA_VIEWCONTENT_HTML),
        boolean('supportDocumentWrite', False),
    ],
    'triggers': [TRG_VIEW_CONTENT],
})

# ===================================================================
# EXECUTE
# ===================================================================
print(f"Creating {len(TAGS)} tags in WEB V2...\n")
ok = 0
fail = 0
for t in TAGS:
    success = create_tag(t['name'], t['type'], t['params'], t['triggers'], paused=True)
    if success:
        ok += 1
    else:
        fail += 1
    time.sleep(0.6)  # rate limit cushion

print(f"\nResultado: {ok} OK / {fail} FAIL / {len(TAGS)} total")
