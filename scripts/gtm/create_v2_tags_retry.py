#!/usr/bin/env python3
"""Retry com cvt_IDs corretos (galleryTemplateId)."""
import warnings, json, time
warnings.filterwarnings('ignore')
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

KEY = '/Volumes/SSD 2T/Dev/tracking-claude-sa.json'
SCOPES = ['https://www.googleapis.com/auth/tagmanager.edit.containers']
creds = service_account.Credentials.from_service_account_file(KEY, scopes=SCOPES)
sess = AuthorizedSession(creds)

BASE = f'https://tagmanager.googleapis.com/tagmanager/v2/accounts/6059193756/containers/253664662/workspaces/2'

# CORRECTED IDs (galleryTemplateId)
T_TWITTER_BASE = 'cvt_PBZB3'
T_TWITTER_EVENT = 'cvt_5D4TS'
T_REDDIT = 'cvt_PBGZL'
T_PINTEREST = 'cvt_NGMPN'
T_SNAP = 'cvt_K4VXG'

# Triggers
TRG_ALL_PAGES = '85'
TRG_PURCHASE = '80'
TRG_BEGIN_CHECKOUT = '81'
TRG_VIEW_CONTENT = '82'
TRG_SIGN_UP = '65'
TRG_FORM_SUBMIT = '87'

def tpl(key, value):
    return {'type': 'template', 'key': key, 'value': value}

def boolean(key, value):
    return {'type': 'boolean', 'key': key, 'value': 'true' if value else 'false'}

def create_tag(name, type_, params, firing_triggers, paused=True):
    body = {
        'name': name, 'type': type_, 'parameter': params,
        'firingTriggerId': firing_triggers, 'paused': paused,
    }
    r = sess.post(f'{BASE}/tags', json=body)
    if r.status_code in (200, 201):
        print(f"  ✅ {name}")
        return True
    print(f"  ❌ {name} [{r.status_code}]: {r.text[:300]}")
    return False

TAGS = []

# Twitter (X)
TAGS.append({'name':'04.00 [CT] [X Ads] Base Pixel', 'type':T_TWITTER_BASE,
    'params':[tpl('pixel_id','{{[CT] [X Ads] Pixel ID}}'), tpl('page_location_op','1')],
    'triggers':[TRG_ALL_PAGES]})
TAGS.append({'name':'04.01 [CT] [X Ads] Evento | Lead', 'type':T_TWITTER_EVENT,
    'params':[tpl('event_id','tw-{{[CT] [X Ads] Pixel ID}}-lead')], 'triggers':[TRG_FORM_SUBMIT]})
TAGS.append({'name':'04.02 [CT] [X Ads] Evento | Purchase', 'type':T_TWITTER_EVENT,
    'params':[tpl('event_id','tw-{{[CT] [X Ads] Pixel ID}}-purchase'),
              tpl('value','{{[CT] [VAR] value}}'), tpl('currency','{{[CT] [VAR] currency}}'),
              tpl('conversion_id','{{[CT] [VAR] transaction_id}}')],
    'triggers':[TRG_PURCHASE]})
TAGS.append({'name':'04.03 [CT] [X Ads] Evento | InitiateCheckout', 'type':T_TWITTER_EVENT,
    'params':[tpl('event_id','tw-{{[CT] [X Ads] Pixel ID}}-checkout'),
              tpl('value','{{[CT] [VAR] value}}'), tpl('currency','{{[CT] [VAR] currency}}')],
    'triggers':[TRG_BEGIN_CHECKOUT]})
TAGS.append({'name':'04.04 [CT] [X Ads] Evento | CompleteRegistration', 'type':T_TWITTER_EVENT,
    'params':[tpl('event_id','tw-{{[CT] [X Ads] Pixel ID}}-signup')],
    'triggers':[TRG_SIGN_UP]})

# Reddit
TAGS.append({'name':'05.00 [CT] [Reddit] Pixel Base', 'type':T_REDDIT,
    'params':[tpl('id','{{[CT] [Reddit] Pixel ID}}'), tpl('eventType','PageVisit'),
              boolean('enableFirstPartyCookies', True)],
    'triggers':[TRG_ALL_PAGES]})
TAGS.append({'name':'05.01 [CT] [Reddit] Evento | Lead', 'type':T_REDDIT,
    'params':[tpl('id','{{[CT] [Reddit] Pixel ID}}'), tpl('eventType','Lead'),
              tpl('conversionId','{{[CT] [VAR] transaction_id}}')],
    'triggers':[TRG_FORM_SUBMIT]})
TAGS.append({'name':'05.02 [CT] [Reddit] Evento | Purchase', 'type':T_REDDIT,
    'params':[tpl('id','{{[CT] [Reddit] Pixel ID}}'), tpl('eventType','Purchase'),
              tpl('currency','{{[CT] [VAR] currency}}'),
              tpl('transactionValue','{{[CT] [VAR] value}}'),
              tpl('transactionId','{{[CT] [VAR] transaction_id}}')],
    'triggers':[TRG_PURCHASE]})

# Pinterest
TAGS.append({'name':'06.00 [CT] [Pinterest] Pixel Base', 'type':T_PINTEREST,
    'params':[tpl('tagId','{{[CT] [Pinterest] Tag ID}}'), tpl('eventName',''),
              tpl('em','{{[CT] [VAR] Email}}')],
    'triggers':[TRG_ALL_PAGES]})
TAGS.append({'name':'06.01 [CT] [Pinterest] Evento | Lead', 'type':T_PINTEREST,
    'params':[tpl('tagId','{{[CT] [Pinterest] Tag ID}}'), tpl('eventName','lead'),
              tpl('lead_type','sign-up')],
    'triggers':[TRG_FORM_SUBMIT]})
TAGS.append({'name':'06.02 [CT] [Pinterest] Evento | Checkout', 'type':T_PINTEREST,
    'params':[tpl('tagId','{{[CT] [Pinterest] Tag ID}}'), tpl('eventName','checkout')],
    'triggers':[TRG_BEGIN_CHECKOUT]})

# Snap
TAGS.append({'name':'07.00 [CT] [Snap] Pixel Base', 'type':T_SNAP,
    'params':[tpl('pixel_id','{{[CT] [Snap] Pixel ID}}'), tpl('event_type','PAGE_VIEW')],
    'triggers':[TRG_ALL_PAGES]})
TAGS.append({'name':'07.01 [CT] [Snap] Evento | Sign Up', 'type':T_SNAP,
    'params':[tpl('pixel_id','{{[CT] [Snap] Pixel ID}}'), tpl('event_type','SIGN_UP'),
              tpl('user_hashed_email','{{[CT] [VAR] Cookie Primário | em}}')],
    'triggers':[TRG_SIGN_UP]})
TAGS.append({'name':'07.02 [CT] [Snap] Evento | Add Cart', 'type':T_SNAP,
    'params':[tpl('pixel_id','{{[CT] [Snap] Pixel ID}}'), tpl('event_type','ADD_CART'),
              tpl('price','{{[CT] [VAR] value}}'), tpl('currency','{{[CT] [VAR] currency}}')],
    'triggers':[TRG_BEGIN_CHECKOUT]})
TAGS.append({'name':'07.03 [CT] [Snap] Evento | Purchase', 'type':T_SNAP,
    'params':[tpl('pixel_id','{{[CT] [Snap] Pixel ID}}'), tpl('event_type','PURCHASE'),
              tpl('price','{{[CT] [VAR] value}}'), tpl('currency','{{[CT] [VAR] currency}}'),
              tpl('transaction_id','{{[CT] [VAR] transaction_id}}')],
    'triggers':[TRG_PURCHASE]})

print(f"Creating {len(TAGS)} tags...\n")
ok = fail = 0
for t in TAGS:
    if create_tag(t['name'], t['type'], t['params'], t['triggers'], paused=True): ok += 1
    else: fail += 1
    time.sleep(0.5)
print(f"\n{ok} OK / {fail} FAIL")
