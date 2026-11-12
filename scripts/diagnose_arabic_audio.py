"""Independent Arabic ASR diagnostic. Requires sherpa-onnx and FFmpeg.

This measures agreement with Whisper's recognition, not human-listening quality.
Short isolated-letter audio is unsuitable for ASR accuracy claims.
The ASR model is a separate optional diagnostic input and is not shipped.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import unicodedata

ROOT=Path(__file__).resolve().parents[1]

def normalized(text):
    text=unicodedata.normalize('NFKC',text)
    text=''.join(c for c in text if unicodedata.category(c)!='Mn')
    text=text.translate(str.maketrans({'أ':'ا','إ':'ا','آ':'ا','ى':'ي','ة':'ه'}))
    return re.sub(r'[^\w\s]',' ',text).strip().split()

def edit_distance(a,b):
    row=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        nxt=[i]
        for j,y in enumerate(b,1):
            nxt.append(min(nxt[-1]+1,row[j]+1,row[j-1]+(x!=y)))
        row=nxt
    return row[-1]

def main():
    import numpy as np
    import sherpa_onnx
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--asr-dir',type=Path,default=Path('/workspace/neural-models/sherpa-onnx-whisper-tiny'))
    parser.add_argument('--precision',choices=['int8','float32'],default='int8')
    parser.add_argument('--audio-dir',type=Path,default=ROOT/'assets/narration')
    parser.add_argument('--output',type=Path,default=Path('/workspace/output/arabic-asr-diagnostic.json'))
    args=parser.parse_args()
    d=args.asr_dir
    suffix='.int8.onnx' if args.precision=='int8' else '.onnx'
    enc=next(p for p in d.glob('*encoder'+suffix) if args.precision=='int8' or '.int8.' not in p.name)
    dec=next(p for p in d.glob('*decoder'+suffix) if args.precision=='int8' or '.int8.' not in p.name)
    tokens=next(d.glob('*tokens.txt'))
    recognizer=sherpa_onnx.OfflineRecognizer.from_whisper(encoder=str(enc),decoder=str(dec),tokens=str(tokens),language='ar',task='transcribe',num_threads=2)
    lines=json.loads((ROOT/'voice-lines.json').read_text())
    desired=['مرحبًا يا صديقي. هيا نتعلم معًا.','الضَّمَّةُ تُشْبِهُ وَاوًا صَغِيرَةً فَوْقَ الْحَرْفِ.','اِقْرَأِ الْكَلِمَةَ، ثُمَّ اِخْتَرْ صُورَتَهَا.','اُنْظُرْ إِلَى شَكْلِ الْحَرْفِ وَنُقَطِهِ.','بِأَيِّ حَرْفٍ تَبْدَأُ كَلِمَةُ تُفَّاحَة؟','الْفَتْحَةُ خَطٌّ صَغِيرٌ فَوْقَ الْحَرْفِ.','الْكَسْرَةُ خَطٌّ صَغِيرٌ تَحْتَ الْحَرْفِ.']
    chosen=[x for x in lines if x['lang']=='ar' and x['text'] in desired]
    results=[]
    for line in chosen:
        path=args.audio_dir/f'{line["id"]}.mp3'
        pcm=subprocess.run(['ffmpeg','-v','error','-i',str(path),'-ar','16000','-ac','1','-f','f32le','-'],capture_output=True,check=True).stdout
        samples=np.frombuffer(pcm,dtype=np.float32)
        stream=recognizer.create_stream();stream.accept_waveform(16000,samples);recognizer.decode_stream(stream)
        recognized=stream.result.text
        a,b=normalized(line['text']),normalized(recognized)
        ac,bc=''.join(a),''.join(b)
        result={'id':line['id'],'expected':line['text'],'recognized':recognized,'normalized_word_error_rate':edit_distance(a,b)/max(1,len(a)),'normalized_character_error_rate_without_spaces':edit_distance(ac,bc)/max(1,len(ac)),'seconds':len(samples)/16000,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
        results.append(result)
        print(json.dumps(result,ensure_ascii=False),flush=True)
    report={'diagnostic_model':d.name,'precision':args.precision,'language':'ar','note':'Recognizer agreement is not a human listening review or proof of pronunciation quality.','results':results}
    args.output.parent.mkdir(exist_ok=True,parents=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__': main()
