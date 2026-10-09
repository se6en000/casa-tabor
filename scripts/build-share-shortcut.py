#!/usr/bin/env python3
"""Builds the "Send to Tabor House" iPhone Shortcut (Jake, Oct 9: "any chance you could just create the shortcut script
and I could import it into my shortcuts?") as public/shortcuts/send-to-tabor-house.shortcut — unsigned: iOS only imports
signed ones, so on a Mac: shortcuts sign -m anyone -i <this> -o "Send to Tabor House.shortcut" (Settings › Send to
Tabor House shows the one line). On adding it asks for the person's address with their key (an import question).

What it does: from the Share Sheet it sends what was shared; with nothing shared (Back Tap) it takes a screenshot and
sends that. It posts to share-in as a form (text: the thing as words, file: the thing itself) and shows the reply.
"""
import plistlib
import uuid
from pathlib import Path

URL = 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/share-in?key='
OUT = Path(__file__).resolve().parent.parent / 'public' / 'shortcuts' / 'send-to-tabor-house.shortcut'


def uid():
    return str(uuid.uuid4()).upper()


def attachment(value):
    return {'Value': value, 'WFSerializationType': 'WFTextTokenAttachment'}


def token_string(text, refs=None):
    """Words with variables in them: each U+FFFC is one variable, by its place."""
    return {'Value': {'string': text, 'attachmentsByRange': refs or {}}, 'WFSerializationType': 'WFTextTokenString'}


INPUT = {'Type': 'ExtensionInput'}
THING = {'Type': 'Variable', 'VariableName': 'Thing'}
if_group = uid()
shot = uid()
fetch = uid()


def action(identifier, **params):
    return {'WFWorkflowActionIdentifier': identifier, 'WFWorkflowActionParameters': params}


actions = [
    # If Shortcut Input does not have any value (Back Tap): a screenshot is the thing.
    action('is.workflow.actions.conditional', GroupingIdentifier=if_group, WFControlFlowMode=0, WFCondition=101,
           WFInput={'Type': 'Variable', 'Variable': attachment(INPUT)}),
    action('is.workflow.actions.takescreenshot', UUID=shot),
    action('is.workflow.actions.setvariable', WFVariableName='Thing',
           WFInput=attachment({'Type': 'ActionOutput', 'OutputName': 'Screenshot', 'OutputUUID': shot})),
    # Otherwise: what was shared.
    action('is.workflow.actions.conditional', GroupingIdentifier=if_group, WFControlFlowMode=1),
    action('is.workflow.actions.setvariable', WFVariableName='Thing', WFInput=attachment(INPUT)),
    action('is.workflow.actions.conditional', GroupingIdentifier=if_group, WFControlFlowMode=2),
    # To the house, as a form: the words and the file.
    action('is.workflow.actions.downloadurl', UUID=fetch, WFURL=URL, WFHTTPMethod='POST', WFHTTPBodyType='Form', ShowHeaders=False,
           WFFormValues={'Value': {'WFDictionaryFieldValueItems': [
               {'WFItemType': 0, 'WFKey': token_string('text'), 'WFValue': token_string('￼', {'{0, 1}': THING})},
               {'WFItemType': 5, 'WFKey': token_string('file'), 'WFValue': {'Value': THING, 'WFSerializationType': 'WFTokenAttachmentParameterState'}},
           ]}, 'WFSerializationType': 'WFDictionaryFieldValue'}),
    # What the house did, in a line.
    action('is.workflow.actions.notification', WFNotificationActionTitle='Tabor House', WFNotificationActionSound=False,
           WFNotificationActionBody=token_string('￼', {'{0, 1}': {'Type': 'ActionOutput', 'OutputName': 'Contents of URL', 'OutputUUID': fetch}})),
]

shortcut = {
    'WFWorkflowClientVersion': '2302.0.4',
    'WFWorkflowMinimumClientVersion': 900,
    'WFWorkflowMinimumClientVersionString': '900',
    'WFWorkflowIcon': {'WFWorkflowIconStartColor': 4282601983, 'WFWorkflowIconGlyphNumber': 59511},
    'WFWorkflowTypes': ['ActionExtension'],
    'WFWorkflowInputContentItemClasses': [
        'WFAppStoreAppContentItem', 'WFArticleContentItem', 'WFContactContentItem', 'WFDateContentItem',
        'WFEmailAddressContentItem', 'WFGenericFileContentItem', 'WFImageContentItem', 'WFiTunesProductContentItem',
        'WFLocationContentItem', 'WFDCMapsLinkContentItem', 'WFAVAssetContentItem', 'WFPDFContentItem',
        'WFPhoneNumberContentItem', 'WFRichTextContentItem', 'WFSafariWebPageContentItem', 'WFStringContentItem',
        'WFURLContentItem',
    ],
    'WFWorkflowOutputContentItemClasses': [],
    'WFWorkflowHasShortcutInputVariables': True,
    'WFWorkflowHasOutputFallback': False,
    'WFQuickActionSurfaces': [],
    'WFWorkflowImportQuestions': [{
        'ActionIndex': 6,
        'Category': 'Parameter',
        'ParameterKey': 'WFURL',
        'DefaultValue': URL,
        'Text': 'Paste your address from Tabor House (Settings › Send to Tabor House › Copy your address)',
    }],
    'WFWorkflowActions': actions,
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_bytes(plistlib.dumps(shortcut, fmt=plistlib.FMT_BINARY))
print(f'wrote {OUT} ({OUT.stat().st_size} bytes)')
