import re, json, os
from pocketsphinx import Decoder, Config, get_model_path
mp=get_model_path()+'/en-us'
txt = open('/home/user/Claude-videos/shorts/flying-cars/SCRIPT.md').read().split('## Voice-over')[1].strip().splitlines()
txt=[l for l in txt if l.strip()]
def norm(s):
    s=s.lower().replace('-',' ')
    return re.sub(r"[^a-z' ]"," ",s).split()
words=[w for l in txt for w in norm(l)]
d=Decoder(hmm=mp+'/en-us',dict=mp+'/cmudict-en-us.dict',lm=None,loglevel='FATAL')
unk=sorted(w for w in set(words) if d.lookup_word(w) is None)
print('unknown',unk)
d.add_word('jetpack','JH EH T P AE K',False)
d.add_word('unluckily','AH N L AH K AH L IY',False)
import wave
w=wave.open('voice16k.wav'); raw=w.readframes(w.getnframes())
d.set_align_text(' '.join(words))
d.start_utt(); d.process_raw(raw,False,True); d.end_utt()
out=[]
for s in d.seg():
    if s.word in ('<s>','</s>','<sil>','[NOISE]') or s.word.startswith('++'): continue
    out.append({'word':s.word,'start':s.start_frame/100,'end':(s.end_frame+1)/100})
print(len(out),'of',len(words))
json.dump(out,open('words_raw.json','w'))
for o in out[:25]: print(o)
for o in out[-5:]: print(o)
