"""Plan pen-up restart points independently of USB and motor control."""

import math


class RecoveryPlanner:
    """Validate durable checkpoints and conservatively read older reports."""

    TOLERANCE = .02

    def __init__(self, job):
        self.job = job
        self.points = job['endpoints']
        self.pens = job['pen_changes']
        self.pen_up = job.get('profile', {}).get('pen_up', .5)

    def checkpoint(self, next_index, confirmed_pens, source='verified'):
        position = self.points[next_index - 1] if next_index else (0., 0., self.pen_up)
        return self.validate(dict(
            next_index=next_index, position=list(position),
            confirmed_pens=sorted(confirmed_pens), source=source,
        ))

    def validate(self, point):
        """A checkpoint must be a pen-up boundary in this exact job."""
        if not isinstance(point, dict):
            raise ValueError('Invalid recovery checkpoint.')
        index = point.get('next_index')
        if type(index) is not int or not 0 <= index <= len(self.points):
            raise ValueError('Invalid recovery command number.')
        expected = self.points[index - 1] if index else (0., 0., self.pen_up)
        if expected[2] != self.pen_up or point.get('position') != list(expected):
            raise ValueError('Recovery position does not match a pen-up boundary.')
        confirmed = point.get('confirmed_pens')
        required = {p['command'] for p in self.pens if p['command'] < index}
        allowed = {p['command'] for p in self.pens if p['command'] <= index}
        if (not isinstance(confirmed, list)
                or any(type(value) is not int for value in confirmed)
                or confirmed != sorted(set(confirmed))
                or not required <= set(confirmed) <= allowed):
            raise ValueError('Recovery pen sequence does not match this drawing.')
        if point.get('source') not in {'verified', 'reported'}:
            raise ValueError('Unknown recovery checkpoint source.')
        return dict(next_index=index, position=list(expected),
                    confirmed_pens=confirmed[:], source=point['source'])

    def describe(self, point):
        point = self.validate(point)
        confirmed = set(point['confirmed_pens'])
        pen = next((p for p in reversed(self.pens)
                    if p['command'] in confirmed), None)
        return point | dict(
            pen_label=pen['pen_label'] if pen else 'the same pen',
            pen_index=pen['index'] if pen else -1,
            pen_id=pen['pen_id'] if pen else None,
            colour=pen['colour'] if pen else None,
        )

    @classmethod
    def on_segment(cls, position, start, end):
        delta = [b - a for a, b in zip(start, end)]
        length_squared = sum(value * value for value in delta)
        if not length_squared:
            return math.dist(position, start) <= cls.TOLERANCE
        fraction = sum((p - a) * d for p, a, d in
                       zip(position, start, delta)) / length_squared
        fraction = max(0., min(1., fraction))
        closest = [a + fraction * d for a, d in zip(start, delta)]
        return math.dist(position, closest) <= cls.TOLERANCE

    def from_report(self, report, accepted, pending, confirmed_pens):
        """Roll back before every possible match in the current colour pass.

        Older senders saved sampled motor positions but no executed command
        index. A sample can intersect several strokes. Taking the earliest
        match may repeat ink, but does not silently skip any candidate stroke.
        This is explicitly labelled a reported-position fallback in the UI.
        """
        if not isinstance(report, dict):
            return None
        position, offset = report.get('position'), report.get('offset')
        if not all(isinstance(value, (list, tuple)) and len(value) == 3
                   for value in (position, offset)):
            return None
        if (any(type(value) not in (int, float) or not math.isfinite(value)
                for value in (*position, *offset))
                or any(abs(value) > .01 for value in offset)):
            return None
        confirmed = set(confirmed_pens)
        first = max(confirmed, default=0)
        last = min(max(accepted, pending), len(self.points) - 1)
        if first > last:
            return None
        for index in range(first, last + 1):
            start = self.points[index - 1] if index else (0., 0., self.pen_up)
            if not self.on_segment(position, start, self.points[index]):
                continue
            # Return to before the possibly incomplete stroke, with pen up.
            while index > first and self.points[index - 1][2] != self.pen_up:
                index -= 1
            try:
                return self.checkpoint(index, confirmed, source='reported')
            except ValueError:
                return None
        return None
