"""Builds one Adobe Connect pod per course.

Usage:  python3 pod/build.py https://YOUR-APP.onrender.com
Output: pod/dist/2020-Course-AI-awareness.pod and pod/dist/2020-Course-AI-teams.pod
"""
import sys, zipfile, pathlib

here = pathlib.Path(__file__).parent
base = (sys.argv[1] if len(sys.argv) > 1 else 'https://2020-course-ai.onrender.com').rstrip('/')
page = (here / 'CustomPod.htm').read_text()
manifest = (here / 'breeze-manifest.xml').read_text()
(here / 'dist').mkdir(exist_ok=True)

for course in ('awareness', 'teams'):
    out = here / 'dist' / f'2020-Course-AI-{course}.pod'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('breeze-manifest.xml', manifest.replace('__COURSE__', course))
        z.writestr('CustomPod.htm', page.replace('__APP_URL__', f'{base}/?course={course}'))
    print('Built', out)
