import json, re, numpy as np, subprocess, wave
SR=48000
subprocess.run(['ffmpeg','-v','error','-y','-i','voice_src.mp3','-ar',str(SR),'-ac','1','-c:a','pcm_s16le','voice_full.wav'],check=True)
w=wave.open('voice_full.wav'); x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768
raw=json.load(open('words_raw.json'))
for r in raw: r['word']=re.sub(r'\(\d\)','',r['word'])
GAP=0.22; THR=0.30
out=[np.zeros(0,np.float32)]; words=[]; t=0.0
# chunk boundaries: split at gaps > THR, cut mid-gap, replace gap with GAP of low-level room tone (silence)
chunks=[]; cur=[raw[0]]
for a,b in zip(raw,raw[1:]):
    if b['start']-a['end']>THR: chunks.append(cur); cur=[b]
    else: cur.append(b)
chunks.append(cur)
pre=0.04
for i,c in enumerate(chunks):
    s0=max(0,c[0]['start']-0.06); e0=c[-1]['end']+0.04
    if i==0: s0=0
    seg=x[int(s0*SR):int(e0*SR)].copy()
    n=int(0.01*SR); seg[:n]*=np.linspace(0,1,n); seg[-n:]*=np.linspace(1,0,n)
    off=t-s0
    for r in c: words.append({'w':r['word'],'s':round(r['start']+off,3),'e':round(r['end']+off,3)})
    out.append(seg); t+=len(seg)/SR
    if i<len(chunks)-1:
        g=int(GAP*SR); out.append(np.zeros(g,np.float32)); t+=GAP
y=np.concatenate(out)
import wave as W
f=W.open('voice.wav','wb'); f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes((np.clip(y,-1,1)*32767).astype(np.int16).tobytes()); f.close()
json.dump(words,open('words.json','w'),indent=0)
print(len(chunks),'chunks; new length',len(y)/SR,'words',len(words),'last end',words[-1]['e'])
# sentence starts
sent=[0]+[i for i in range(1,len(words)) if words[i]['s']-words[i-1]['e']>=GAP-0.01]
print([ (words[i]['w'],words[i]['s']) for i in sent])
